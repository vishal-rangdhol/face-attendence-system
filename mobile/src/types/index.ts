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

export interface FaceValidationResult {
  isValid: boolean;
  error?: string;
  boundingBox?: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
  roll?: number;
  yaw?: number;
  pitch?: number;
}

export type ActiveScreen = "home" | "register" | "enroll" | "verify" | "history";
