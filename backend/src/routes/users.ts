import { Hono } from "hono";
import { RegisterUserRequestSchema, UserDocument } from "../models/user";
import { USER_ID_REGEX } from "../models/biometric";
import { couchbase } from "../db/couchbase";

export const usersRouter = new Hono();

usersRouter.post("/register", async (c) => {
  const body = await c.req.json();
  const parseResult = RegisterUserRequestSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      { error: "Validation failed", details: parseResult.error.format() },
      400
    );
  }

  const { name, timezone } = parseResult.data;
  const userId = `usr_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const userDoc: UserDocument = {
    id: userId,
    type: "user",
    name,
    timezone: timezone || "UTC",
    hasBiometrics: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await couchbase.insert("users", `usr::${userId}`, userDoc);
    return c.json({ success: true, user: userDoc }, 201);
  } catch (err) {
    console.error("[UsersRouter] Failed to register user:", err);
    return c.json({ error: "Failed to persist user profile" }, 500);
  }
});

usersRouter.get("/:id", async (c) => {
  const userId = c.req.param("id");

  if (!USER_ID_REGEX.test(userId)) {
    return c.json({ error: "Invalid user ID format" }, 400);
  }

  const key = `usr::${userId}`;

  try {
    const user = await couchbase.get<UserDocument>("users", key);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ success: true, user });
  } catch (err) {
    console.error(`[UsersRouter] Error fetching user ${userId}:`, err);
    return c.json({ error: "Failed to retrieve user" }, 500);
  }
});
