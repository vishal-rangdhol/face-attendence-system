import type { DetectedFace, LivenessChallenge, LivenessChallengeType } from '../types';

export type ChallengeStatus = 'IDLE' | 'ACTIVE' | 'PASSED' | 'FAILED' | 'TIMEOUT';

export interface ChallengeState {
  currentChallenge: LivenessChallenge | null;
  status: ChallengeStatus;
  elapsedMs: number;
  remainingSeconds: number;
}

/**
 * LivenessChallengeController
 *
 * Coordinates randomized interactive liveness challenges for anti-spoof protection.
 * Daily Check-In selects 1 randomized challenge from the challenge pool.
 */
export class LivenessChallengeController {
  public static readonly DEFAULT_TIMEOUT_MS = 5000;

  private static readonly CHALLENGE_PROMPTS: Record<LivenessChallengeType, string> = {
    BLINK: 'Please blink your eyes naturally',
    TURN_LEFT: 'Slowly turn your head to the left',
    TURN_RIGHT: 'Slowly turn your head to the right',
    SMILE: 'Please smile for the camera',
  };

  private currentChallenge: LivenessChallenge | null = null;
  private status: ChallengeStatus = 'IDLE';
  private startTime: number = 0;
  private blinkState: 'OPEN' | 'CLOSED' = 'OPEN';
  private initialYaw: number | null = null;

  /**
   * Selects a single randomized challenge for daily check-in.
   */
  public selectRandomChallenge(
    pool: LivenessChallengeType[] = ['BLINK', 'TURN_LEFT', 'TURN_RIGHT', 'SMILE']
  ): LivenessChallenge {
    const randomIndex = Math.floor(Math.random() * pool.length);
    const type = pool[randomIndex];
    this.currentChallenge = {
      type,
      promptText: LivenessChallengeController.CHALLENGE_PROMPTS[type],
      durationMs: LivenessChallengeController.DEFAULT_TIMEOUT_MS,
    };
    this.status = 'ACTIVE';
    this.startTime = Date.now();
    this.blinkState = 'OPEN';
    this.initialYaw = null;
    return this.currentChallenge;
  }

  /**
   * Resets active challenge state.
   */
  public reset(): void {
    this.currentChallenge = null;
    this.status = 'IDLE';
    this.startTime = 0;
    this.blinkState = 'OPEN';
    this.initialYaw = null;
  }

  /**
   * Evaluates face frame against active challenge conditions.
   */
  public evaluateFrame(face: DetectedFace | null | undefined): ChallengeState {
    if (!this.currentChallenge || this.status !== 'ACTIVE') {
      return this.getState();
    }

    const now = Date.now();
    const elapsed = now - this.startTime;

    if (elapsed > this.currentChallenge.durationMs) {
      this.status = 'TIMEOUT';
      return this.getState();
    }

    if (!face) {
      return this.getState();
    }

    switch (this.currentChallenge.type) {
      case 'BLINK': {
        const leftEye = face.leftEyeOpenProbability ?? 1;
        const rightEye = face.rightEyeOpenProbability ?? 1;

        if (leftEye < 0.25 && rightEye < 0.25) {
          this.blinkState = 'CLOSED';
        } else if (this.blinkState === 'CLOSED' && leftEye > 0.60 && rightEye > 0.60) {
          this.status = 'PASSED';
        }
        break;
      }

      case 'TURN_LEFT': {
        const yaw = face.yawAngle ?? 0;
        if (this.initialYaw === null) {
          this.initialYaw = yaw;
        }
        const deltaYaw = yaw - this.initialYaw;
        // Requires dynamic head rotation: relative delta >= 15 deg, or yaw > 18 deg with positive delta >= 8 deg
        if (deltaYaw >= 15 || (yaw > 18 && deltaYaw >= 8)) {
          this.status = 'PASSED';
        }
        break;
      }

      case 'TURN_RIGHT': {
        const yaw = face.yawAngle ?? 0;
        if (this.initialYaw === null) {
          this.initialYaw = yaw;
        }
        const deltaYaw = yaw - this.initialYaw;
        // Requires dynamic head rotation: relative delta <= -15 deg, or yaw < -18 deg with negative delta <= -8 deg
        if (deltaYaw <= -15 || (yaw < -18 && deltaYaw <= -8)) {
          this.status = 'PASSED';
        }
        break;
      }

      case 'SMILE': {
        const smile = face.smilingProbability ?? 0;
        if (smile > 0.60) {
          this.status = 'PASSED';
        }
        break;
      }
    }

    return this.getState();
  }

  public getState(): ChallengeState {
    const elapsed = this.startTime > 0 ? Date.now() - this.startTime : 0;
    const timeout = this.currentChallenge?.durationMs ?? LivenessChallengeController.DEFAULT_TIMEOUT_MS;
    const remainingSeconds = Math.max(0, Math.ceil((timeout - elapsed) / 1000));

    return {
      currentChallenge: this.currentChallenge,
      status: this.status,
      elapsedMs: elapsed,
      remainingSeconds,
    };
  }
}
