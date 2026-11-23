import { Hono } from "hono";
import { EnrollBiometricsRequestSchema, BiometricDocument, USER_ID_REGEX } from "../models/biometric";
import { UserDocument } from "../models/user";
import { couchbase } from "../db/couchbase";
import { encryptEmbedding } from "../services/crypto";
import { createRateLimiter } from "../middleware/rateLimit";

export const biometricsRouter = new Hono();

// Apply rate limiting: max 10 biometric requests per minute per IP
biometricsRouter.use("*", createRateLimiter({ windowMs: 60 * 1000, maxRequests: 10 }));

biometricsRouter.post("/enroll", async (c) => {
  const body = await c.req.json();
  const parseResult = EnrollBiometricsRequestSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      { error: "Validation failed", details: parseResult.error.format() },
      400
    );
  }

  const { userId, embedding, modelVersion, consentGranted } = parseResult.data;

  // 1. Verify user exists
  const userKey = `usr::${userId}`;
  const user = await couchbase.get<UserDocument>("users", userKey);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const now = new Date().toISOString();
  const bioId = `bio_${userId}`;
  const bioKey = `bio::${userId}`;

  // Encrypt the 192-D biometric vector with AES-256-GCM before database write
  const encrypted = encryptEmbedding(embedding);

  const biometricDoc: BiometricDocument = {
    id: bioId,
    userId,
    type: "biometric",
    encryptedEmbedding: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    embeddingDimension: embedding.length,
    modelVersion: modelVersion || "MobileFaceNet-v1",
    consentGranted,
    consentTimestamp: now,
    enrolledAt: now,
  };

  try {
    // 2. Persist encrypted biometric document
    await couchbase.upsert("biometrics", bioKey, biometricDoc);

    // 3. Update user profile flag
    user.hasBiometrics = true;
    user.updatedAt = now;
    await couchbase.upsert("users", userKey, user);

    return c.json({
      success: true,
      message: "Biometric face embedding encrypted and enrolled successfully",
      enrolledAt: now,
      encrypted: true,
    });
  } catch (err) {
    console.error("[BiometricsRouter] Failed to enroll biometrics:", err);
    return c.json({ error: "Failed to store biometric enrollment" }, 500);
  }
});

/**
 * Biometric enrollment status check.
 * NOTE: Raw biometric vectors are NEVER returned over the network to protect privacy.
 * Face matching is performed exclusively on-device.
 */
biometricsRouter.get("/:userId", async (c) => {
  const userId = c.req.param("userId");

  if (!USER_ID_REGEX.test(userId)) {
    return c.json({ error: "Invalid user ID format" }, 400);
  }

  const bioKey = `bio::${userId}`;

  try {
    const biometric = await couchbase.get<BiometricDocument>("biometrics", bioKey);
    if (!biometric) {
      return c.json({ error: "Biometric enrollment not found" }, 404);
    }

    // Return metadata only. Do not expose plaintext or encrypted embeddings.
    return c.json({
      success: true,
      enrolled: true,
      modelVersion: biometric.modelVersion,
      enrolledAt: biometric.enrolledAt,
      embeddingDimension: biometric.embeddingDimension,
    });
  } catch (err) {
    console.error(`[BiometricsRouter] Error fetching biometric status for ${userId}:`, err);
    return c.json({ error: "Failed to fetch biometric record" }, 500);
  }
});

biometricsRouter.delete("/:userId", async (c) => {
  const userId = c.req.param("userId");

  if (!USER_ID_REGEX.test(userId)) {
    return c.json({ error: "Invalid user ID format" }, 400);
  }

  const bioKey = `bio::${userId}`;
  const userKey = `usr::${userId}`;

  try {
    const user = await couchbase.get<UserDocument>("users", userKey);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Delete biometric template from Couchbase
    await couchbase.delete("biometrics", bioKey);

    // Update user profile hasBiometrics = false (preserves user profile & attendance logs)
    user.hasBiometrics = false;
    user.updatedAt = new Date().toISOString();
    await couchbase.upsert("users", userKey, user);

    return c.json({
      success: true,
      message: "Biometric face enrollment permanently deleted",
    });
  } catch (err) {
    console.error(`[BiometricsRouter] Failed to delete biometric data for ${userId}:`, err);
    return c.json({ error: "Failed to delete biometric data" }, 500);
  }
});
