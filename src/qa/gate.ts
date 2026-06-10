/**
 * Retrieval confidence gate — the reliability core.
 *
 * answer_question never synthesizes when retrieval confidence is low; it refuses
 * with "not found" instead. This is the "zero mis-fires" instinct from tick-data
 * validation applied to RAG: a wrong-but-confident answer is worse than an
 * honest refusal. Pure function => directly unit-tested and tuned via thresholds.
 */
export interface GateThresholds {
  /** Top-1 cosine similarity must be at least this to attempt an answer. */
  minTopSimilarity: number;
  /** Mean cosine similarity over retrieved context must be at least this. */
  minMeanSimilarity: number;
}

export interface GateDecision {
  pass: boolean;
  topSimilarity: number;
  meanSimilarity: number;
  reason: string;
}

export function evaluateConfidence(
  scores: readonly number[],
  thresholds: GateThresholds,
): GateDecision {
  if (scores.length === 0) {
    return { pass: false, topSimilarity: 0, meanSimilarity: 0, reason: "no results retrieved" };
  }
  const top = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (top < thresholds.minTopSimilarity) {
    return {
      pass: false,
      topSimilarity: top,
      meanSimilarity: mean,
      reason: `top similarity ${top.toFixed(3)} below floor ${thresholds.minTopSimilarity}`,
    };
  }
  if (mean < thresholds.minMeanSimilarity) {
    return {
      pass: false,
      topSimilarity: top,
      meanSimilarity: mean,
      reason: `mean similarity ${mean.toFixed(3)} below floor ${thresholds.minMeanSimilarity}`,
    };
  }
  return {
    pass: true,
    topSimilarity: top,
    meanSimilarity: mean,
    reason: "confidence above thresholds",
  };
}
