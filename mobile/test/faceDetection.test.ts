import { test, expect, describe } from "bun:test";
import { CONFIG } from "../src/config";

describe("Face Detection Quality Gate Rules", () => {
  const limits = CONFIG.FACE_VALIDATION;

  test("validates configuration parameters", () => {
    expect(limits.MAX_PITCH_DEG).toBe(15);
    expect(limits.MAX_YAW_DEG).toBe(15);
    expect(limits.MAX_ROLL_DEG).toBe(10);
    expect(limits.MIN_FACE_AREA_RATIO).toBe(0.20);
    expect(limits.MIN_EYE_OPEN_PROBABILITY).toBe(0.5);
  });

  test("detects out-of-bound roll angles", () => {
    const isRollValid = (roll: number) => Math.abs(roll) <= limits.MAX_ROLL_DEG;
    expect(isRollValid(5)).toBe(true);
    expect(isRollValid(-8)).toBe(true);
    expect(isRollValid(12)).toBe(false);
    expect(isRollValid(-15)).toBe(false);
  });

  test("detects out-of-bound yaw and pitch angles", () => {
    const isYawValid = (yaw: number) => Math.abs(yaw) <= limits.MAX_YAW_DEG;
    const isPitchValid = (pitch: number) => Math.abs(pitch) <= limits.MAX_PITCH_DEG;

    expect(isYawValid(10)).toBe(true);
    expect(isYawValid(-20)).toBe(false);
    expect(isPitchValid(5)).toBe(true);
    expect(isPitchValid(18)).toBe(false);
  });

  test("enforces eye openness requirements", () => {
    const areEyesOpen = (left: number, right: number) =>
      left >= limits.MIN_EYE_OPEN_PROBABILITY && right >= limits.MIN_EYE_OPEN_PROBABILITY;

    expect(areEyesOpen(0.9, 0.85)).toBe(true);
    expect(areEyesOpen(0.4, 0.9)).toBe(false); // One eye blinking/closed
    expect(areEyesOpen(0.2, 0.1)).toBe(false); // Both eyes closed
  });

  test("enforces face area framing ratio", () => {
    const isFramingAcceptable = (faceW: number, faceH: number, imgW: number, imgH: number) => {
      const ratio = (faceW * faceH) / (imgW * imgH);
      return ratio >= limits.MIN_FACE_AREA_RATIO && ratio <= 0.85;
    };

    // Good framing (e.g. 300x400 in 600x800 = 25%)
    expect(isFramingAcceptable(300, 400, 600, 800)).toBe(true);
    // Too far (e.g. 100x120 in 600x800 = 2.5%)
    expect(isFramingAcceptable(100, 120, 600, 800)).toBe(false);
  });
});
