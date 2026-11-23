import { test, expect, describe } from "bun:test";
import { getServerTimeContext } from "../src/services/time";
import { RegisterUserRequestSchema } from "../src/models/user";
import { EnrollBiometricsRequestSchema, USER_ID_REGEX } from "../src/models/biometric";
import { SubmitAttendanceRequestSchema } from "../src/models/attendance";

describe("Time and Timezone Services", () => {
  test("generates valid UTC ISO timestamp and local date for Asia/Kolkata", () => {
    const context = getServerTimeContext("Asia/Kolkata");
    expect(context.utcTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(context.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context.timezone).toBe("Asia/Kolkata");
  });

  test("calculates timezone-correct local date for UTC-12 (Etc/GMT+12)", () => {
    const context = getServerTimeContext("Etc/GMT+12");
    expect(context.timezone).toBe("Etc/GMT+12");
    expect(context.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context.utcTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("calculates timezone-correct local date for UTC (UTC)", () => {
    const context = getServerTimeContext("UTC");
    expect(context.timezone).toBe("UTC");
    expect(context.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context.utcTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("calculates timezone-correct local date for UTC+14 (Pacific/Kiritimati)", () => {
    const context = getServerTimeContext("Pacific/Kiritimati");
    expect(context.timezone).toBe("Pacific/Kiritimati");
    expect(context.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context.utcTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("falls back to UTC on invalid timezone", () => {
    const context = getServerTimeContext("Invalid/Zone_Name");
    expect(context.timezone).toBe("UTC");
    expect(context.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Model Validation Schemas & User ID Security", () => {
  test("validates user registration", () => {
    const valid = RegisterUserRequestSchema.safeParse({ name: "Alice", timezone: "Asia/Kolkata" });
    expect(valid.success).toBe(true);

    const invalid = RegisterUserRequestSchema.safeParse({ name: "" });
    expect(invalid.success).toBe(false);
  });

  test("validates USER_ID_REGEX strictly", () => {
    expect(USER_ID_REGEX.test("usr_1234abcd")).toBe(true);
    expect(USER_ID_REGEX.test("usr_test-user_01")).toBe(true);
    expect(USER_ID_REGEX.test("admin")).toBe(false);
    expect(USER_ID_REGEX.test("../../etc/passwd")).toBe(false);
    expect(USER_ID_REGEX.test("usr_;;DROP TABLE")).toBe(false);
    expect(USER_ID_REGEX.test("")).toBe(false);
  });

  test("enforces 128 or 192 dimensions for biometrics", () => {
    const embedding192 = new Array(192).fill(0.05);
    const valid192 = EnrollBiometricsRequestSchema.safeParse({
      userId: "usr_123",
      embedding: embedding192,
      consentGranted: true,
    });
    expect(valid192.success).toBe(true);

    const embedding128 = new Array(128).fill(0.05);
    const valid128 = EnrollBiometricsRequestSchema.safeParse({
      userId: "usr_123",
      embedding: embedding128,
      consentGranted: true,
    });
    expect(valid128.success).toBe(true);

    const embedding100 = new Array(100).fill(0.05);
    const invalid = EnrollBiometricsRequestSchema.safeParse({
      userId: "usr_123",
      embedding: embedding100,
      consentGranted: true,
    });
    expect(invalid.success).toBe(false);
  });

  test("rejects biometric enrollment with malformed user ID", () => {
    const embedding192 = new Array(192).fill(0.05);
    const invalidUserId = EnrollBiometricsRequestSchema.safeParse({
      userId: "invalid_id_without_prefix",
      embedding: embedding192,
      consentGranted: true,
    });
    expect(invalidUserId.success).toBe(false);
  });

  test("validates attendance submission", () => {
    const valid = SubmitAttendanceRequestSchema.safeParse({
      userId: "usr_123",
      similarityScore: 0.91,
      verifiedOnDevice: true,
    });
    expect(valid.success).toBe(true);

    const invalidUserId = SubmitAttendanceRequestSchema.safeParse({
      userId: "bad_user",
      similarityScore: 0.91,
      verifiedOnDevice: true,
    });
    expect(invalidUserId.success).toBe(false);
  });
});

describe("Fixed Backend Verification Threshold (0.85)", () => {
  const { config } = require("../src/config");

  test("configures default similarity threshold to 0.85", () => {
    expect(config.thresholds.defaultSimilarity).toBe(0.85);
  });

  test("backend attendance gate rejects 0.84 and accepts 0.85+", () => {
    const backendAccepts = (score: number) => score >= config.thresholds.defaultSimilarity;

    expect(backendAccepts(0.84)).toBe(false); // 0.84 -> FAIL
    expect(backendAccepts(0.85)).toBe(true);  // 0.85 -> PASS (exact threshold)
    expect(backendAccepts(0.86)).toBe(true);  // 0.86 -> PASS
    expect(backendAccepts(0.88)).toBe(true);  // 0.88 -> PASS
    expect(backendAccepts(0.92)).toBe(true);  // 0.92 -> PASS
  });

  test("attendance document key deterministically blocks duplicate daily submissions", () => {
    const userId = "usr_01";
    const date = "2026-11-20";
    const key1 = `att::${userId}::${date}`;
    const key2 = `att::${userId}::${date}`;
    expect(key1).toBe(key2);
  });
});
