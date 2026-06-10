// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L8 · THE RUNNER — execute the labeled dataset against the REAL system
//
// The crucial design choice: this reuses the PRODUCTION functions (searchDocs,
// answerQuestion) rather than a parallel copy. So the eval measures the actual
// system an agent would use — not a stand-in that can drift from reality.
//
// Per case it gathers:
//   • retrieval  — top-k docIds → recall@k and reciprocal rank (same ranking used to
//     answer; positives only have meaningful expected_sources)
//   • refusal    — did answerQuestion refuse? (correct iff negative)
//   • faithfulness — for ANSWERED positives, ask llm.judge() how grounded the answer
//     is in the same contexts it was built from
// ═══════════════════════════════════════════════════════════════════════════
import type { Sql } from "../../src/db/client.js";
import type { Embedder } from "../../src/embeddings/index.js";
import type { LLMProvider, RetrievedContext } from "../../src/llm/index.js";
import { searchDocs } from "../../src/retrieval/search.js";
import { answerQuestion } from "../../src/qa/answer.js";
import { recallAtK, reciprocalRank } from "./metrics.js";
import type { CaseResult, EvalCase } from "./types.js";

export interface RunnerDeps {
  sql: Sql;
  embedder: Embedder;
  llm: LLMProvider;
}

/**
 * Run the full labeled dataset, producing one CaseResult per case.
 *
 * For each case we measure retrieval (recall@k, reciprocal rank from the same
 * top-k used to answer) and QA behavior (refusal correctness, and faithfulness
 * via the LLM judge for answered positives). Negatives must refuse.
 */
export async function runEval(
  deps: RunnerDeps,
  cases: readonly EvalCase[],
  k: number,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (const c of cases) {
    // LEARN: retrieve once for the retrieval metrics...
    const hits = await searchDocs(deps, c.question, k);
    const retrievedDocIds = hits.map((h) => h.docId);

    // ...and run the full QA pipeline (which gates + maybe synthesizes) for the
    // generation metrics. Same code an agent hits in production.
    const answer = await answerQuestion(deps, c.question, { k });

    let grounded: number | null = null;
    if (c.type === "positive" && !answer.refused) {
      // LEARN: judge faithfulness against the SAME contexts the answer was built
      // from. grounded stays null for refusals/negatives (nothing was asserted).
      const contexts: RetrievedContext[] = hits.map((h) => ({
        id: h.id,
        title: h.title,
        source: h.source,
        content: h.content,
        score: h.score,
      }));
      const judged = await deps.llm.judge(answer.answer, contexts);
      grounded = judged.grounded;
    }

    results.push({
      id: c.id,
      type: c.type,
      question: c.question,
      retrievedDocIds,
      recall: recallAtK(retrievedDocIds, c.expected_sources, k),
      reciprocalRank: reciprocalRank(retrievedDocIds, c.expected_sources),
      refused: answer.refused,
      grounded,
      answer: answer.answer,
    });
  }

  return results;
}
