import { Hono } from "hono";
import { SubmitAttendanceRequestSchema, AttendanceDocument } from "../models/attendance";
import { USER_ID_REGEX } from "../models/biometric";
import { UserDocument } from "../models/user";
import { couchbase, DuplicateKeyError } from "../db/couchbase";
import { getServerTimeContext } from "../services/time";
import { config } from "../config";

export const attendanceRouter = new Hono();

attendanceRouter.post("/submit", async (c) => {
  const body = await c.req.json();
  const parseResult = SubmitAttendanceRequestSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      { error: "Validation failed", details: parseResult.error.format() },
      400
    );
  }

  const { userId, similarityScore, verifiedOnDevice, timezone } = parseResult.data;

  // 1. Validate that the user exists
  const userKey = `usr::${userId}`;
  const user = await couchbase.get<UserDocument>("users", userKey);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!user.hasBiometrics) {
    return c.json(
      { error: "User does not have an active biometric face enrollment" },
      400
    );
  }

  // 2. Validate similarity score meets threshold
  if (similarityScore < config.thresholds.defaultSimilarity) {
    return c.json(
      {
        error: "Face similarity score below verification threshold",
        score: similarityScore,
        requiredThreshold: config.thresholds.defaultSimilarity,
      },
      422
    );
  }

  // 3. Compute server-authoritative UTC timestamp and user-local calendar date
  const userTimezone = user.timezone || timezone || "UTC";
  const { utcTimestamp, localDate, timezone: resolvedTz } = getServerTimeContext(userTimezone);

  // 4. Construct deterministic attendance key: att::<userId>::<YYYY-MM-DD>
  const attendanceKey = `att::${userId}::${localDate}`;

  const attendanceDoc: AttendanceDocument = {
    id: attendanceKey,
    type: "attendance",
    userId,
    date: localDate,
    serverTimestamp: utcTimestamp,
    status: "PRESENT",
    similarityScore,
    verifiedOnDevice,
  };

  // 5. Attempt atomic insert
  try {
    await couchbase.insert("attendance", attendanceKey, attendanceDoc);

    return c.json(
      {
        success: true,
        message: `Attendance marked successfully for ${localDate}`,
        record: attendanceDoc,
        timezone: resolvedTz,
      },
      201
    );
  } catch (err) {
    if (err instanceof DuplicateKeyError) {
      return c.json(
        {
          error: "Duplicate attendance submission",
          message: `Attendance has already been recorded for today (${localDate}) in timezone ${resolvedTz}.`,
          date: localDate,
        },
        409
      );
    }

    console.error("[AttendanceRouter] Failed to record attendance:", err);
    return c.json({ error: "Failed to record attendance" }, 500);
  }
});

attendanceRouter.get("/history/:userId", async (c) => {
  const userId = c.req.param("userId");

  if (!USER_ID_REGEX.test(userId)) {
    return c.json({ error: "Invalid user ID format" }, 400);
  }

  try {
    const statement = `
      SELECT a.*
      FROM \`${config.couchbase.bucket}\`.\`${config.couchbase.scope}\`.\`attendance\` a
      WHERE a.userId = $userId
      ORDER BY a.serverTimestamp DESC
    `;

    const records = await couchbase.query<AttendanceDocument>(statement, { userId });

    return c.json({
      success: true,
      userId,
      count: records.length,
      records,
    });
  } catch (err) {
    console.error(`[AttendanceRouter] Failed to fetch history for ${userId}:`, err);
    return c.json({ error: "Failed to retrieve attendance history" }, 500);
  }
});
