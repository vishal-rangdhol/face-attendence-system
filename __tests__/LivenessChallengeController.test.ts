import { describe, expect, it, beforeEach } from 'bun:test';
import { LivenessChallengeController } from '../src/modules/biometric/engines/LivenessChallengeController';

describe('LivenessChallengeController (Randomized Anti-Spoof Challenges)', () => {
  let controller: LivenessChallengeController;

  beforeEach(() => {
    controller = new LivenessChallengeController();
  });

  it('selects a valid randomized challenge from pool', () => {
    const challenge = controller.selectRandomChallenge(['BLINK', 'TURN_LEFT', 'TURN_RIGHT', 'SMILE']);
    expect(['BLINK', 'TURN_LEFT', 'TURN_RIGHT', 'SMILE']).toContain(challenge.type);
    expect(challenge.promptText.length).toBeGreaterThan(0);
    expect(challenge.durationMs).toBe(5000);
    expect(controller.getState().status).toBe('ACTIVE');
  });

  it('completes BLINK challenge only after eyes close then reopen', () => {
    controller.selectRandomChallenge(['BLINK']);

    // Eyes open
    let state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      leftEyeOpenProbability: 0.9,
      rightEyeOpenProbability: 0.9,
    });
    expect(state.status).toBe('ACTIVE');

    // Eyes closed (blink down)
    state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      leftEyeOpenProbability: 0.1,
      rightEyeOpenProbability: 0.1,
    });
    expect(state.status).toBe('ACTIVE');

    // Eyes reopened (blink up)
    state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      leftEyeOpenProbability: 0.85,
      rightEyeOpenProbability: 0.85,
    });
    expect(state.status).toBe('PASSED');
  });

  it('completes TURN_LEFT challenge when yaw angle exceeds +18 degrees', () => {
    controller.selectRandomChallenge(['TURN_LEFT']);

    let state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      yawAngle: 5,
    });
    expect(state.status).toBe('ACTIVE');

    state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      yawAngle: 22,
    });
    expect(state.status).toBe('PASSED');
  });

  it('rejects static pre-angled face without dynamic rotation for TURN_LEFT', () => {
    controller.selectRandomChallenge(['TURN_LEFT']);

    // Starts already tilted at 20 degrees
    let state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      yawAngle: 20,
    });
    expect(state.status).toBe('ACTIVE');

    // Stays at 20 degrees without turning further (zero delta)
    state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      yawAngle: 20,
    });
    expect(state.status).toBe('ACTIVE');

    // Actually rotates further to 36 degrees (delta >= 15)
    state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      yawAngle: 36,
    });
    expect(state.status).toBe('PASSED');
  });

  it('completes SMILE challenge when smiling probability exceeds 0.60', () => {
    controller.selectRandomChallenge(['SMILE']);

    let state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      smilingProbability: 0.2,
    });
    expect(state.status).toBe('ACTIVE');

    state = controller.evaluateFrame({
      bounds: { origin: { x: 100, y: 100 }, size: { width: 100, height: 100 } },
      smilingProbability: 0.85,
    });
    expect(state.status).toBe('PASSED');
  });
});
