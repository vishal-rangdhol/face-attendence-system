import { test, expect, describe, mock } from "bun:test";

mock.module("react-native", () => ({
  Image: { resolveAssetSource: () => ({ uri: "" }) },
  Platform: { OS: "android" },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) },
}));
mock.module("expo-secure-store", () => ({
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));
mock.module("react-native-fast-tflite", () => ({
  loadTensorflowModel: () => Promise.resolve({ run: () => [] }),
}));
mock.module("expo-asset", () => ({
  Asset: { fromModule: () => ({ downloadAsync: () => Promise.resolve(), localUri: "file:///mock" }) },
}));
mock.module("expo-image-manipulator", () => ({
  manipulateAsync: () => Promise.resolve({ base64: "" }),
  SaveFormat: { JPEG: "jpeg" },
}));

const { computeCosineSimilarity, l2Normalize } = await import("../src/services/faceRecognition");
const { storageService } = await import("../src/services/storage");
import { CONFIG } from "../src/config";

describe("Fixed Verification Threshold (0.85)", () => {
  const threshold = CONFIG.VERIFICATION_THRESHOLD;

  test("verifies fixed verification threshold is 0.85", () => {
    expect(threshold).toBe(0.85);
    expect(CONFIG.DEFAULT_SIMILARITY_THRESHOLD).toBe(0.85);
  });

  test("enforces exact matching range (0.85 - 1.00)", () => {
    const isMatch = (score: number) => score >= CONFIG.VERIFICATION_THRESHOLD;

    // Below 0.85: Reject
    expect(isMatch(0.8399)).toBe(false);
    expect(isMatch(0.84)).toBe(false); // 0.84 -> FAIL
    expect(isMatch(0.8499)).toBe(false);

    // 0.85 and above: Accept
    expect(isMatch(0.85)).toBe(true);  // 0.85 -> PASS (exact boundary)
    expect(isMatch(0.86)).toBe(true);  // 0.86 -> PASS
    expect(isMatch(0.88)).toBe(true);  // 0.88 -> PASS
    expect(isMatch(0.92)).toBe(true);  // 0.92 -> PASS
    expect(isMatch(0.95)).toBe(true);  // 0.95 -> PASS
    expect(isMatch(1.00)).toBe(true);  // 1.00 -> PASS
  });

  test("failed matching (score < 0.85) prevents attendance submission", () => {
    let attendanceSubmitted = false;
    const processMatch = (score: number) => {
      const isMatch = score >= CONFIG.VERIFICATION_THRESHOLD;
      if (isMatch) {
        attendanceSubmitted = true;
      }
    };

    // Sub-threshold attempts
    processMatch(0.84);
    expect(attendanceSubmitted).toBe(false);

    processMatch(0.72);
    expect(attendanceSubmitted).toBe(false);

    processMatch(0.8499);
    expect(attendanceSubmitted).toBe(false);
  });

  test("successful matching (score >= 0.85) proceeds to attendance submission", () => {
    let submittedScore: number | null = null;
    const processMatch = (score: number) => {
      const isMatch = score >= CONFIG.VERIFICATION_THRESHOLD;
      if (isMatch) {
        submittedScore = score;
      }
    };

    processMatch(0.85);
    expect(submittedScore).toBe(0.85);

    processMatch(0.92);
    expect(submittedScore).toBe(0.92);
  });

  test("threshold cannot be modified through storage service", () => {
    // Assert that storageService has no methods to get or set threshold
    expect((storageService as any).saveThreshold).toBeUndefined();
    expect((storageService as any).getThreshold).toBeUndefined();
  });

  test("matches same identity under slight variation (simulated)", () => {
    const enrolledRaw = new Array(192).fill(0).map((_, i) => Math.sin(i * 0.1));
    const enrolled = l2Normalize(enrolledRaw);

    const liveRaw = enrolled.map((v, i) => v + (Math.sin(i * 0.5) * 0.05));
    const live = l2Normalize(liveRaw);

    const score = computeCosineSimilarity(live, enrolled);
    expect(score).toBeGreaterThanOrEqual(threshold);
  });

  test("rejects distinct identities (simulated impostor)", () => {
    const enrolledRaw = new Array(192).fill(0).map((_, i) => (i % 2 === 0 ? 1 : 0));
    const impostorRaw = new Array(192).fill(0).map((_, i) => (i % 2 === 1 ? 1 : 0));

    const enrolled = l2Normalize(enrolledRaw);
    const impostor = l2Normalize(impostorRaw);

    const score = computeCosineSimilarity(impostor, enrolled);
    expect(score).toBeLessThan(threshold);
  });
});
