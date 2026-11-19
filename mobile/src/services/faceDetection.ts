import FaceDetection, { Face } from "@react-native-ml-kit/face-detection";
import { CONFIG } from "../config";
import { FaceValidationResult, FaceBoundingBox } from "../types";

export class FaceDetectionService {
  /**
   * Detects and validates faces in a captured photo using Google ML Kit.
   *
   * @param imageUri Local file URI of the captured image
   * @param imageWidth Width of the captured image
   * @param imageHeight Height of the captured image
   */
  async detectAndValidateFace(
    imageUri: string,
    imageWidth?: number,
    imageHeight?: number
  ): Promise<FaceValidationResult> {
    try {
      const faces: Face[] = await FaceDetection.detect(imageUri, {
        landmarkMode: "all",
        classificationMode: "all",
        performanceMode: "accurate",
        minFaceSize: 0.15,
      });

      if (!faces || faces.length === 0) {
        return {
          isValid: false,
          reason: "No face detected. Please ensure your face is clearly visible inside the oval.",
          imageUri,
        };
      }

      if (faces.length > 1) {
        return {
          isValid: false,
          reason: `Detected ${faces.length} faces. Ensure only one person is in the frame.`,
          imageUri,
        };
      }

      const face = faces[0];
      return this.validateSingleFace(face, imageUri, imageWidth, imageHeight);
    } catch (err) {
      console.error("[FaceDetectionService] ML Kit error:", err);
      return {
        isValid: false,
        reason: err instanceof Error ? err.message : "Face detection failed.",
        imageUri,
      };
    }
  }

  /**
   * Validates positioning, Euler angles, size, and eye openness of a single detected face.
   */
  private validateSingleFace(
    face: Face,
    imageUri: string,
    imageWidth?: number,
    imageHeight?: number
  ): FaceValidationResult {
    const limits = CONFIG.FACE_VALIDATION;

    // Pitch: rotationX (head tilt up/down)
    const pitch = Math.round(face.rotationX || 0);
    // Yaw: rotationY (head turn left/right)
    const yaw = Math.round(face.rotationY || 0);
    // Roll: rotationZ (head tilt sideways)
    const roll = Math.round(face.rotationZ || 0);

    const angles = { pitch, yaw, roll };

    // 1. Validate Roll (tilt sideways)
    if (Math.abs(roll) > limits.MAX_ROLL_DEG) {
      return {
        isValid: false,
        reason: "Keep your head level and upright.",
        imageUri,
        angles,
      };
    }

    // 2. Validate Yaw (turn left/right)
    if (Math.abs(yaw) > limits.MAX_YAW_DEG) {
      return {
        isValid: false,
        reason: yaw > 0 ? "Turn your face slightly to the right." : "Turn your face slightly to the left.",
        imageUri,
        angles,
      };
    }

    // 3. Validate Pitch (tilt up/down)
    if (Math.abs(pitch) > limits.MAX_PITCH_DEG) {
      return {
        isValid: false,
        reason: pitch > 0 ? "Tilt your head slightly down." : "Tilt your head slightly up.",
        imageUri,
        angles,
      };
    }

    // 4. Validate Eye Openness (avoid closed-eye / blink captures)
    const leftEye = face.leftEyeOpenProbability ?? 1.0;
    const rightEye = face.rightEyeOpenProbability ?? 1.0;
    const eyesOpen = { left: leftEye, right: rightEye };

    if (leftEye < limits.MIN_EYE_OPEN_PROBABILITY || rightEye < limits.MIN_EYE_OPEN_PROBABILITY) {
      return {
        isValid: false,
        reason: "Both eyes must be open and looking at the camera.",
        imageUri,
        angles,
        eyesOpen,
      };
    }

    // 5. Validate Face Size / Coverage relative to Image Frame
    let areaRatio = 0.3; // Default fallback
    if (imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0) {
      const faceArea = face.frame.width * face.frame.height;
      const totalArea = imageWidth * imageHeight;
      areaRatio = faceArea / totalArea;

      if (areaRatio < limits.MIN_FACE_AREA_RATIO) {
        return {
          isValid: false,
          reason: "Face is too far away. Move closer to the camera.",
          imageUri,
          angles,
          eyesOpen,
          metrics: { areaRatio },
        };
      }

      if (areaRatio > 0.85) {
        return {
          isValid: false,
          reason: "Face is too close. Move slightly back from the camera.",
          imageUri,
          angles,
          eyesOpen,
          metrics: { areaRatio },
        };
      }
    }

    const boundingBox: FaceBoundingBox = {
      originX: Math.max(0, Math.round(face.frame.left)),
      originY: Math.max(0, Math.round(face.frame.top)),
      width: Math.round(face.frame.width),
      height: Math.round(face.frame.height),
    };

    return {
      isValid: true,
      imageUri,
      imageWidth,
      imageHeight,
      boundingBox,
      angles,
      eyesOpen,
      metrics: { areaRatio },
    };
  }
}

export const faceDetectionService = new FaceDetectionService();
