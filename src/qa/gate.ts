// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L6 · THE RELIABILITY GATE — confidence & refusal (the heart)
//
// A retrieval system ALWAYS returns something — even for "What is the capital of
// France?", pgvector hands back the 5 least-dissimilar broker-doc chunks. If you
// blindly synthesize from them, you get a confident, fluent, WRONG answer. In a
// financial/trading context that's dangerous.
//
// The fix: a confidence gate. Before answering, check whether retrieval is actually
// confident, using the SIMILARITY SCORES as the signal. If the best match is weak,
// or the set is weak on average, REFUSE ("not found") instead of guessing. This is
// a direct port of a trading-infra reflex: a wrong fill is worse than no fill; a
// wrong answer is worse than an honest "I don't know."
//
// WHY TWO THRESHOLDS:
//   • top-1 floor  — is the single best chunk relevant at all? ("nothing is close")
//   • mean floor   — is the retrieved SET coherent, or one lucky hit amid noise?
// Both must clear to answer. They're tunable knobs, and the eval-loop MEASURES how
// well they're set (the negative cases exist precisely to score refusal).
//
// Calibration note: `pnpm calibrate` prints positive top-sim min≈0.354 vs negative
// top-sim max≈0.313 — the default 0.35 floor sits in that gap. The threshold was
// CHOSEN from data, then defended by the CI gate.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retrieval confidence gate — the reliability core.
 *
 * answer_question never synthesizes when retrieval confidence is low; it refuses
 * with "not found" instead. Pure function => directly unit-tested and tuned.
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

// LEARN: a PURE function of (scores, thresholds). No IO, no model — which is why
// test/gate.test.ts can exhaustively cover every branch (no results / top-below /
// mean-below / pass) as fast, deterministic unit tests.
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
  // LEARN: we return the numbers we judged on (top/mean) even on PASS, so the caller
  // can observe the decision — that's why AnswerResult carries `confidence`.
  return {
    pass: true,
    topSimilarity: top,
    meanSimilarity: mean,
    reason: "confidence above thresholds",
  };
}
