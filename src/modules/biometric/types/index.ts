export type BiometricStatus =
  | 'NOT_ENROLLED'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED';

export type AttendanceEventType = 'CHECK_IN' | 'CHECK_OUT';

export type LivenessChallengeType = 'BLINK' | 'TURN_LEFT' | 'TURN_RIGHT' | 'SMILE';

export interface FaceBounds {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

export interface DetectedFace {
  bounds: FaceBounds;
  rollAngle?: number;
  yawAngle?: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
}

export interface QualityAssessment {
  passed: boolean;
  reason?: string;
  isCentered: boolean;
  isWellLit: boolean;
  isProperDistance: boolean;
}

export interface LivenessChallenge {
  type: LivenessChallengeType;
  promptText: string;
  durationMs: number;
}

export interface VectorMatchResult {
  matched: boolean;
  similarity: number;
  threshold: number;
  bestAngle: 'center' | 'left' | 'right';
}

export interface StoredBaselineVectors {
  vector_center: number[];
  vector_left: number[];
  vector_right: number[];
  updated_at: string;
}

export interface CheckinInput {
  event_type: AttendanceEventType;
  verified: boolean;
  confidence: number;
  gps_lat?: number;
  gps_lng?: number;
  device_id: string;
  timestamp_client: string;
}

export interface CheckinResult {
  success: boolean;
  status: 'RECORDED';
  log_id: string;
  flags: string[];
}

export interface QueuedOfflinePunch {
  id: string;
  payload: CheckinInput;
  queued_at: string;
  retry_count: number;
}
