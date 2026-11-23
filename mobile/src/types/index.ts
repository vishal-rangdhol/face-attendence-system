export interface UserProfile {
  id: string;
  name: string;
  timezone: string;
  hasBiometrics: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface BiometricEnrollment {
  userId: string;
  embedding: number[];
  embeddingDimension: number;
  modelVersion: string;
  enrolledAt: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  serverTimestamp: string;
  status: "PRESENT";
  similarityScore: number;
  verifiedOnDevice: boolean;
}

export interface FaceBoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface FaceValidationResult {
  isValid: boolean;
  reason?: string;
  imageUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  isLive?: boolean;
  livenessMethod?: "blink_challenge" | "passive_gate";
  boundingBox?: FaceBoundingBox;
  angles?: {
    pitch: number;
    yaw: number;
    roll: number;
  };
  eyesOpen?: {
    left: number;
    right: number;
  };
  metrics?: {
    areaRatio: number;
  };
}

export type ActiveScreen = "home" | "register" | "enroll" | "verify" | "history";
