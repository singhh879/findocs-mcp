import { loadConfig } from "../config.js";
import type { Sql } from "../db/client.js";
import type { Embedder } from "../embeddings/index.js";
import type { LLMProvider, RetrievedContext } from "../llm/index.js";
import { searchDocs } from "../retrieval/search.js";
import { evaluateConfidence, type GateThresholds } from "./gate.js";

/** The standardized refusal message. Detectable by the eval harness. */
export const NOT_FOUND_MESSAGE =
  "Not found: the indexed documents don't contain enough information to answer this confidently.";

export interface Citation {
  id: string;
  source: string;
  title: string;
  url: string | null;
  ord: number;
  score: number;
}

export interface AnswerResult {
  answer: string;
  refused: boolean;
  reason: string;
  citations: Citation[];
  confidence: { topSimilarity: number; meanSimilarity: number };
}

export interface AnswerDeps {
  sql: Sql;
  embedder: Embedder;
  llm: LLMProvider;
}

export interface AnswerOptions {
  k?: number;
  thresholds?: GateThresholds;
}

/**
 * Grounded Q&A: retrieve → confidence gate → synthesize with citations, or refuse.
 * Refusal is a first-class outcome, not an error.
 */
export async function answerQuestion(
  deps: AnswerDeps,
  question: string,
  options: AnswerOptions = {},
): Promise<AnswerResult> {
  const cfg = loadConfig();
  const k = options.k ?? cfg.SEARCH_TOP_K;
  const thresholds: GateThresholds = options.thresholds ?? {
    minTopSimilarity: cfg.ANSWER_MIN_TOP_SIMILARITY,
    minMeanSimilarity: cfg.ANSWER_MIN_MEAN_SIMILARITY,
  };

  const hits = await searchDocs(deps, question, k);
  const gate = evaluateConfidence(hits.map((h) => h.score), thresholds);
  const confidence = { topSimilarity: gate.topSimilarity, meanSimilarity: gate.meanSimilarity };

  if (!gate.pass) {
    return {
      answer: NOT_FOUND_MESSAGE,
      refused: true,
      reason: gate.reason,
      citations: [],
      confidence,
    };
  }

  const contexts: RetrievedContext[] = hits.map((h) => ({
    id: h.id,
    title: h.title,
    source: h.source,
    content: h.content,
    score: h.score,
  }));

  const answer = await deps.llm.synthesize(question, contexts);
  const citations: Citation[] = hits.map((h) => ({
    id: h.id,
    source: h.source,
    title: h.title,
    url: h.url,
    ord: h.ord,
    score: h.score,
  }));

  return { answer, refused: false, reason: gate.reason, citations, confidence };
}
