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
    const hits = await searchDocs(deps, c.question, k);
    const retrievedDocIds = hits.map((h) => h.docId);

    const answer = await answerQuestion(deps, c.question, { k });

    let grounded: number | null = null;
    if (c.type === "positive" && !answer.refused) {
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
