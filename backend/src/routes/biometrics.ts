import { Hono } from "hono";
import { EnrollBiometricsRequestSchema, BiometricDocument } from "../models/biometric";
import { UserDocument } from "../models/user";
import { couchbase } from "../db/couchbase";

export const biometricsRouter = new Hono();

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

  const biometricDoc: BiometricDocument = {
    id: bioId,
    userId,
    type: "biometric",
    embedding,
    embeddingDimension: 128,
    modelVersion: modelVersion || "MobileFaceNet-v1",
    consentGranted,
    consentTimestamp: now,
    enrolledAt: now,
  };

  try {
    // 2. Persist biometric document
    await couchbase.upsert("biometrics", bioKey, biometricDoc);

    // 3. Update user profile flag
    user.hasBiometrics = true;
    user.updatedAt = now;
    await couchbase.upsert("users", userKey, user);

    return c.json({
      success: true,
      message: "Biometric face embedding enrolled successfully",
      enrolledAt: now,
    });
  } catch (err) {
    console.error("[BiometricsRouter] Failed to enroll biometrics:", err);
    return c.json({ error: "Failed to store biometric enrollment", details: String(err) }, 500);
  }
});

biometricsRouter.get("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const bioKey = `bio::${userId}`;

  try {
    const biometric = await couchbase.get<BiometricDocument>("biometrics", bioKey);
    if (!biometric) {
      return c.json({ error: "Biometric enrollment not found" }, 404);
    }
    return c.json({ success: true, biometric });
  } catch (err) {
    console.error(`[BiometricsRouter] Error fetching biometrics for ${userId}:`, err);
    return c.json({ error: "Failed to fetch biometric record", details: String(err) }, 500);
  }
});

biometricsRouter.delete("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const bioKey = `bio::${userId}`;
  const userKey = `usr::${userId}`;

  try {
    // Delete biometric document
    await couchbase.delete("biometrics", bioKey);

    // Update user profile hasBiometrics = false
    const user = await couchbase.get<UserDocument>("users", userKey);
    if (user) {
      user.hasBiometrics = false;
      user.updatedAt = new Date().toISOString();
      await couchbase.upsert("users", userKey, user);
    }

    return c.json({
      success: true,
      message: "Biometric face enrollment permanently deleted",
    });
  } catch (err) {
    console.error(`[BiometricsRouter] Failed to delete biometric data for ${userId}:`, err);
    return c.json({ error: "Failed to delete biometric data", details: String(err) }, 500);
  }
});
