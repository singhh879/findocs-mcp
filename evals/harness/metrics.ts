// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L8 · EVAL METRICS — how you put a number on a RAG system
//
// You can't improve what you can't measure. A RAG system has TWO things to measure,
// and they fail differently:
//   RETRIEVAL  — did we fetch the right chunks?
//     • recall@k — of the expected docs, what fraction appear in the top-k? ("did we
//       even fetch it?")  Binary 0/1 when there's a single expected doc.
//     • MRR (Mean Reciprocal Rank) — how HIGHLY was the first relevant doc ranked?
//       rank1→1.0, rank2→0.5, rank3→0.33… ("did we rank it well?")
//   GENERATION — given the chunks, did we answer well?
//     • faithfulness — is the answer supported by the context? (LLM-as-judge, L7)
//     • refusal accuracy — answer positives, refuse negatives? ("did we know when to
//       stay quiet?")  Over-refusing and under-refusing are BOTH wrong.
//
// recall@k and MRR are classic information-retrieval metrics; faithfulness and
// refusal are the LLM-era additions. Together they cover the whole pipeline. All
// pure functions → worked examples live in test/metrics.test.ts.
// ═══════════════════════════════════════════════════════════════════════════
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
  // LEARN: walk the ranked list; the position of the FIRST relevant hit determines
  // the score. This is why recall@5 can be 1 (it's in there somewhere) while MRR is
  // low (it was ranked 5th) — the two metrics measure different failures.
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
  // LEARN: each metric is averaged over the SUBSET it applies to — retrieval metrics
  // over positives, faithfulness over ANSWERED positives, refusal accuracy over ALL
  // cases (positives + negatives). Mixing those subsets up is a common eval bug.
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
