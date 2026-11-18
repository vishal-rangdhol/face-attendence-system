import type { StoredBaselineVectors, VectorMatchResult } from '../types';

/**
 * VectorMatchEngine
 *
 * Implements 1:1 on-device cosine similarity matching between a freshly generated
 * face embedding vector and stored baseline vectors (center, left, right).
 *
 * Threshold: 0.88 (MobileFaceNet calibrated floor per specification).
 */
export class VectorMatchEngine {
  public static readonly DEFAULT_MATCH_THRESHOLD = 0.88;

  /**
   * Computes dot product between two finite number vectors.
   */
  public static dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * Computes Euclidean norm (L2 norm) of a vector.
   */
  public static norm(a: number[]): number {
    let sumSquares = 0;
    for (let i = 0; i < a.length; i++) {
      sumSquares += a[i] * a[i];
    }
    return Math.sqrt(sumSquares);
  }

  /**
   * Computes Cosine Similarity between vector A and B.
   * Returns a value between -1.0 and 1.0.
   */
  public static cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
      return 0;
    }
    const dot = VectorMatchEngine.dotProduct(a, b);
    const normA = VectorMatchEngine.norm(a);
    const normB = VectorMatchEngine.norm(b);

    if (normA === 0 || normB === 0) {
      return 0;
    }
    return dot / (normA * normB);
  }

  /**
   * Matches candidate vector against enrolled baseline vectors (center, left, right).
   * Finds the maximum similarity score among enrolled poses.
   */
  public static match(
    candidate: number[],
    baseline: StoredBaselineVectors,
    threshold: number = VectorMatchEngine.DEFAULT_MATCH_THRESHOLD
  ): VectorMatchResult {
    const scoreCenter = VectorMatchEngine.cosineSimilarity(candidate, baseline.vector_center);
    const scoreLeft = VectorMatchEngine.cosineSimilarity(candidate, baseline.vector_left);
    const scoreRight = VectorMatchEngine.cosineSimilarity(candidate, baseline.vector_right);

    let bestScore = scoreCenter;
    let bestAngle: 'center' | 'left' | 'right' = 'center';

    if (scoreLeft > bestScore) {
      bestScore = scoreLeft;
      bestAngle = 'left';
    }
    if (scoreRight > bestScore) {
      bestScore = scoreRight;
      bestAngle = 'right';
    }

    return {
      matched: bestScore >= threshold,
      similarity: Number(bestScore.toFixed(4)),
      threshold,
      bestAngle,
    };
  }
}
