import { describe, expect, it } from 'bun:test';
import { VectorMatchEngine } from '../src/modules/biometric/engines/VectorMatchEngine';
import type { StoredBaselineVectors } from '../src/modules/biometric/types';

describe('VectorMatchEngine (On-Device 1:1 Cosine Similarity)', () => {
  const createMockVector = (seed: number): number[] => {
    const v: number[] = new Array(128);
    let sumSquares = 0;
    for (let i = 0; i < 128; i++) {
      const val = Math.sin(i * 0.15 + seed);
      v[i] = val;
      sumSquares += val * val;
    }
    const norm = Math.sqrt(sumSquares);
    return v.map((x) => x / norm);
  };

  const centerVector = createMockVector(0.5);
  const leftVector = createMockVector(1.0);
  const rightVector = createMockVector(1.5);

  const baseline: StoredBaselineVectors = {
    vector_center: centerVector,
    vector_left: leftVector,
    vector_right: rightVector,
    updated_at: new Date().toISOString(),
  };

  it('computes 1.0 similarity for identical vectors', () => {
    const sim = VectorMatchEngine.cosineSimilarity(centerVector, centerVector);
    expect(Number(sim.toFixed(4))).toBe(1.0);
  });

  it('computes 0 similarity for orthogonal vectors', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    const sim = VectorMatchEngine.cosineSimilarity(a, b);
    expect(sim).toBe(0);
  });

  it('matches when candidate vector is very close to baseline center pose', () => {
    // Add tiny perturbation
    const candidate = centerVector.map((x) => x + 0.005);
    const result = VectorMatchEngine.match(candidate, baseline, 0.88);

    expect(result.matched).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.88);
    expect(result.bestAngle).toBe('center');
  });

  it('matches when candidate vector is closest to left pose', () => {
    const candidate = leftVector.map((x) => x + 0.005);
    const result = VectorMatchEngine.match(candidate, baseline, 0.88);

    expect(result.matched).toBe(true);
    expect(result.bestAngle).toBe('left');
  });

  it('rejects candidate when cosine similarity is below threshold (0.88)', () => {
    const completelyDifferentVector = createMockVector(9.99);
    const result = VectorMatchEngine.match(completelyDifferentVector, baseline, 0.88);

    expect(result.matched).toBe(false);
    expect(result.similarity).toBeLessThan(0.88);
  });
});
