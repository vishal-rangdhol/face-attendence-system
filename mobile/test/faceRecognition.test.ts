import { test, expect, describe, mock } from "bun:test";

mock.module("react-native", () => ({
  Image: { resolveAssetSource: () => ({ uri: "" }) },
  Platform: { OS: "android" },
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

const {
  decodeBase64,
  normalizeRgbPixels,
  l2Normalize,
  computeCosineSimilarity,
} = await import("../src/services/faceRecognition");

describe("MobileFaceNet Biometric Pipeline (MS3)", () => {
  test("decodeBase64 decodes ASCII string correctly", () => {
    // "Hello World" in base64 is "SGVsbG8gV29ybGQ="
    const decoded = decodeBase64("SGVsbG8gV29ybGQ=");
    const text = new TextDecoder().decode(decoded);
    expect(text).toBe("Hello World");
  });

  test("normalizeRgbPixels maps [0..255] RGB to [-1..1] float32 range", () => {
    // 112 * 112 pixels, 4 channels (RGBA)
    const rawRgba = new Uint8Array(112 * 112 * 4);
    // Fill first pixel with R=0, G=128, B=255, A=255
    rawRgba[0] = 0;
    rawRgba[1] = 128;
    rawRgba[2] = 255;
    rawRgba[3] = 255;

    const normalized = normalizeRgbPixels(rawRgba);
    expect(normalized.length).toBe(112 * 112 * 3);

    // R=0 -> (0 - 127.5) / 128 = -0.99609375
    expect(normalized[0]).toBeCloseTo(-0.996, 2);
    // G=128 -> (128 - 127.5) / 128 = 0.00390625
    expect(normalized[1]).toBeCloseTo(0.004, 2);
    // B=255 -> (255 - 127.5) / 128 = 0.99609375
    expect(normalized[2]).toBeCloseTo(0.996, 2);
  });

  test("l2Normalize produces unit vector with length 1.0", () => {
    const rawVector = new Float32Array(192);
    for (let i = 0; i < 192; i++) {
      rawVector[i] = (i - 96) * 0.5;
    }

    const normalized = l2Normalize(rawVector);
    expect(normalized.length).toBe(192);

    // Sum of squares of unit vector should equal 1.0
    const sumSq = normalized.reduce((acc, val) => acc + val * val, 0);
    expect(sumSq).toBeCloseTo(1.0, 3);
  });

  test("computeCosineSimilarity correctly measures vector alignment", () => {
    const v1 = l2Normalize([1, 0, 0, 0]);
    const v2 = l2Normalize([1, 0, 0, 0]);
    const vOrthogonal = l2Normalize([0, 1, 0, 0]);
    const vOpposite = l2Normalize([-1, 0, 0, 0]);

    // Identical vectors -> 1.0
    expect(computeCosineSimilarity(v1, v2)).toBe(1.0);
    // Orthogonal vectors -> 0.0
    expect(computeCosineSimilarity(v1, vOrthogonal)).toBe(0.0);
    // Opposite vectors -> -1.0
    expect(computeCosineSimilarity(v1, vOpposite)).toBe(-1.0);
  });

  test("computeCosineSimilarity handles dimension mismatches gracefully", () => {
    expect(computeCosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(computeCosineSimilarity([], [])).toBe(0);
  });
});
