import { describe, expect, it } from 'bun:test';
import { MLKitQualityAssessor } from '../src/modules/biometric/engines/MLKitQualityAssessor';

describe('MLKitQualityAssessor (Face Quality and Pose Validation)', () => {
  const viewWidth = 360;
  const viewHeight = 640;

  it('rejects when no face is detected in frame', () => {
    const result = MLKitQualityAssessor.assess(null, viewWidth, viewHeight);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('No face detected');
  });

  it('accepts a centered face with valid size and level head pose', () => {
    const validFace = {
      bounds: {
        origin: { x: 100, y: 180 },
        size: { width: 160, height: 200 },
      },
      rollAngle: 2,
      yawAngle: -3,
      leftEyeOpenProbability: 0.95,
      rightEyeOpenProbability: 0.95,
    };

    const result = MLKitQualityAssessor.assess(validFace, viewWidth, viewHeight);
    expect(result.passed).toBe(true);
    expect(result.isCentered).toBe(true);
  });

  it('rejects face when head is tilted beyond max roll angle (15 deg)', () => {
    const tiltedFace = {
      bounds: {
        origin: { x: 100, y: 180 },
        size: { width: 160, height: 200 },
      },
      rollAngle: 25, // Excessive tilt
      yawAngle: 0,
    };

    const result = MLKitQualityAssessor.assess(tiltedFace, viewWidth, viewHeight);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Keep your head level');
  });

  it('rejects face when user is too far from camera', () => {
    const distantFace = {
      bounds: {
        origin: { x: 150, y: 250 },
        size: { width: 50, height: 60 }, // Too small (< 25% of viewport)
      },
      rollAngle: 0,
      yawAngle: 0,
    };

    const result = MLKitQualityAssessor.assess(distantFace, viewWidth, viewHeight);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Move closer');
  });

  it('rejects turned face during center pose when yaw exceeds 20 deg', () => {
    const turnedFace = {
      bounds: {
        origin: { x: 100, y: 180 },
        size: { width: 160, height: 200 },
      },
      rollAngle: 0,
      yawAngle: 25,
      leftEyeOpenProbability: 0.95,
      rightEyeOpenProbability: 0.95,
    };

    const result = MLKitQualityAssessor.assess(turnedFace, viewWidth, viewHeight, { pose: 'center' });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Look directly at the front camera');
  });

  it('accepts turned face during left/right pose capture', () => {
    const turnedLeftFace = {
      bounds: {
        origin: { x: 80, y: 180 },
        size: { width: 160, height: 200 },
      },
      rollAngle: 0,
      yawAngle: 25, // Head turned for left pose
      leftEyeOpenProbability: 0.95,
      rightEyeOpenProbability: 0.95,
    };

    const result = MLKitQualityAssessor.assess(turnedLeftFace, viewWidth, viewHeight, { pose: 'left' });
    expect(result.passed).toBe(true);
  });
});
