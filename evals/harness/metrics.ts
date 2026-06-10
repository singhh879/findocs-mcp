import type { CaseResult, Scorecard } from "./types.js";

/** Mean of a list, 0 for an empty list. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * recall@k for one case: fraction of expected doc ids present in the top-k
 * retrieved ids. Binary (0/1) when there is a single expected source.
 */
export function recallAtK(
  retrieved: readonly string[],
  expected: readonly string[],
  k: number,
): number {
  if (expected.length === 0) return 0;
  const topK = new Set(retrieved.slice(0, k));
  let found = 0;
  for (const e of expected) if (topK.has(e)) found++;
  return found / expected.length;
}

/**
 * Reciprocal rank for one case: 1/(rank of the first relevant doc), else 0.
 * Rank is 1-based.
 */
export function reciprocalRank(
  retrieved: readonly string[],
  expected: readonly string[],
): number {
  const want = new Set(expected);
  for (let i = 0; i < retrieved.length; i++) {
    const id = retrieved[i];
    if (id !== undefined && want.has(id)) return 1 / (i + 1);
  }
  return 0;
}

/**
 * Refusal correctness for one case: did the system refuse exactly when it
 * should have? Positives must answer; negatives must refuse.
 */
export function refusalCorrect(type: CaseResult["type"], refused: boolean): boolean {
  return type === "negative" ? refused : !refused;
}

/**
 * Aggregate per-case results into the scorecard.
 *
 * `recallAtK`/`reciprocalRank` are computed by the runner (which holds each
 * case's expected ids) and stored on `r.recall` / `r.reciprocalRank`; this
 * function just averages over the relevant subset.
 */
export function aggregate(results: readonly CaseResult[]): Scorecard {
  const positives = results.filter((r) => r.type === "positive");
  const negatives = results.filter((r) => r.type === "negative");
  const answeredPositives = positives.filter((r) => !r.refused);
  const groundedScores = answeredPositives
    .map((r) => r.grounded)
    .filter((g): g is number => g !== null);

  return {
    recall_at_k: mean(positives.map((r) => r.recall)),
    mrr: mean(positives.map((r) => r.reciprocalRank)),
    faithfulness: mean(groundedScores),
    refusal_accuracy: mean(results.map((r) => (refusalCorrect(r.type, r.refused) ? 1 : 0))),
    answer_rate: positives.length === 0 ? 0 : answeredPositives.length / positives.length,
    counts: {
      total: results.length,
      positive: positives.length,
      negative: negatives.length,
      answered: answeredPositives.length,
    },
  };
}
