import { test, expect, describe } from "bun:test";
import { getServerTimeContext } from "../src/services/time";
import { RegisterUserRequestSchema } from "../src/models/user";
import { EnrollBiometricsRequestSchema } from "../src/models/biometric";
import { SubmitAttendanceRequestSchema } from "../src/models/attendance";

describe("Time and Timezone Services", () => {
  test("generates valid UTC ISO timestamp and local date for Asia/Kolkata", () => {
    const context = getServerTimeContext("Asia/Kolkata");
    expect(context.utcTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(context.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context.timezone).toBe("Asia/Kolkata");
  });

  test("falls back to UTC on invalid timezone", () => {
    const context = getServerTimeContext("Invalid/Zone_Name");
    expect(context.timezone).toBe("UTC");
    expect(context.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Model Validation Schemas", () => {
  test("validates user registration", () => {
    const valid = RegisterUserRequestSchema.safeParse({ name: "Alice", timezone: "Asia/Kolkata" });
    expect(valid.success).toBe(true);

    const invalid = RegisterUserRequestSchema.safeParse({ name: "" });
    expect(invalid.success).toBe(false);
  });

  test("enforces exactly 128 dimensions for biometrics", () => {
    const embedding128 = new Array(128).fill(0.05);
    const valid = EnrollBiometricsRequestSchema.safeParse({
      userId: "usr_123",
      embedding: embedding128,
      consentGranted: true,
    });
    expect(valid.success).toBe(true);

    const embedding100 = new Array(100).fill(0.05);
    const invalid = EnrollBiometricsRequestSchema.safeParse({
      userId: "usr_123",
      embedding: embedding100,
      consentGranted: true,
    });
    expect(invalid.success).toBe(false);
  });

  test("validates attendance submission", () => {
    const valid = SubmitAttendanceRequestSchema.safeParse({
      userId: "usr_123",
      similarityScore: 0.91,
      verifiedOnDevice: true,
    });
    expect(valid.success).toBe(true);
  });
});
