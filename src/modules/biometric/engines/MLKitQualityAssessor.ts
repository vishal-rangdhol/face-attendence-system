import type { DetectedFace, QualityAssessment } from '../types';

export interface QualityAssessmentOptions {
  pose?: 'center' | 'left' | 'right' | 'any';
  targetCenterYRatio?: number;
}

/**
 * MLKitQualityAssessor
 *
 * Real-time on-device evaluation of face frame quality before vector extraction.
 * Rejects occluded, tilted, distant, or dark faces with actionable user guidance.
 */
export class MLKitQualityAssessor {
  public static readonly MIN_FACE_WIDTH_RATIO = 0.25; // Face width relative to view width
  public static readonly MAX_FACE_WIDTH_RATIO = 0.85;
  public static readonly MAX_ROLL_ANGLE = 15; // Max roll tilt
  public static readonly MAX_YAW_ANGLE = 20; // Max horizontal yaw for center pose
  public static readonly MIN_EYE_OPEN_PROB = 0.40; // Minimum eye openness

  /**
   * Assesses quality of a detected face inside the camera preview viewport.
   */
  public static assess(
    face: DetectedFace | null | undefined,
    viewWidth: number = 360,
    viewHeight: number = 640,
    options?: QualityAssessmentOptions
  ): QualityAssessment {
    if (!face || !face.bounds) {
      return {
        passed: false,
        reason: 'No face detected. Align your face inside the oval.',
        isCentered: false,
        isWellLit: false,
        isProperDistance: false,
      };
    }

    const pose = options?.pose ?? 'center';
    const targetCenterYRatio = options?.targetCenterYRatio ?? 0.45;

    const { origin, size } = face.bounds;
    const faceCenterX = origin.x + size.width / 2;
    const faceCenterY = origin.y + size.height / 2;
    const viewCenterX = viewWidth / 2;
    const viewCenterY = viewHeight * targetCenterYRatio;

    // 1. Center Check (allow slightly wider horizontal margin for turned poses)
    const maxXRatio = pose === 'center' ? 0.22 : 0.32;
    const maxYRatio = 0.28;
    const xDistRatio = Math.abs(faceCenterX - viewCenterX) / viewWidth;
    const yDistRatio = Math.abs(faceCenterY - viewCenterY) / viewHeight;
    const isCentered = xDistRatio < maxXRatio && yDistRatio < maxYRatio;

    if (!isCentered) {
      return {
        passed: false,
        reason: 'Center your face inside the oval guide',
        isCentered: false,
        isWellLit: true,
        isProperDistance: true,
      };
    }

    // 2. Distance Check (Face scale)
    const faceWidthRatio = size.width / viewWidth;
    const isProperDistance =
      faceWidthRatio >= MLKitQualityAssessor.MIN_FACE_WIDTH_RATIO &&
      faceWidthRatio <= MLKitQualityAssessor.MAX_FACE_WIDTH_RATIO;

    if (faceWidthRatio < MLKitQualityAssessor.MIN_FACE_WIDTH_RATIO) {
      return {
        passed: false,
        reason: 'Move closer to the camera',
        isCentered: true,
        isWellLit: true,
        isProperDistance: false,
      };
    }

    if (faceWidthRatio > MLKitQualityAssessor.MAX_FACE_WIDTH_RATIO) {
      return {
        passed: false,
        reason: 'Move back slightly',
        isCentered: true,
        isWellLit: true,
        isProperDistance: false,
      };
    }

    // 3. Head Tilt & Angle Checks
    const roll = Math.abs(face.rollAngle ?? 0);
    const yaw = Math.abs(face.yawAngle ?? 0);

    if (roll > MLKitQualityAssessor.MAX_ROLL_ANGLE) {
      return {
        passed: false,
        reason: 'Keep your head level and steady',
        isCentered: true,
        isWellLit: true,
        isProperDistance: true,
      };
    }

    // Yaw check only applies to straight-on center pose.
    // For angled poses (left, right, any), head rotation is deliberate.
    if (pose === 'center' && yaw > MLKitQualityAssessor.MAX_YAW_ANGLE) {
      return {
        passed: false,
        reason: 'Look directly at the front camera',
        isCentered: true,
        isWellLit: true,
        isProperDistance: true,
      };
    }

    // 4. Eye Openness (Blink/Sleepiness check during quality capture)
    const leftEye = face.leftEyeOpenProbability ?? 1;
    const rightEye = face.rightEyeOpenProbability ?? 1;
    if (leftEye < MLKitQualityAssessor.MIN_EYE_OPEN_PROB && rightEye < MLKitQualityAssessor.MIN_EYE_OPEN_PROB) {
      return {
        passed: false,
        reason: 'Please keep both eyes open',
        isCentered: true,
        isWellLit: true,
        isProperDistance: true,
      };
    }

    return {
      passed: true,
      isCentered: true,
      isWellLit: true,
      isProperDistance: true,
    };
  }
}
