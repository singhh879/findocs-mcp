// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L2 · THE ANSWER PIPELINE — retrieve → gate → synthesize → cite
//
// This is the heart of RAG (Retrieval-Augmented Generation) — and notice it's
// mostly plumbing + policy, not magic. A grounded-QA request is a fixed sequence:
//
//   question
//     ├─▶ 1. RETRIEVE   embed the question, find top-k similar chunks   (→ search.ts)
//     ├─▶ 2. GATE       is retrieval confident enough to answer at all? (→ qa/gate.ts)
//     │        └─ no ──▶ REFUSE ("not found")   ◀── the reliability core
//     ├─▶ 3. SYNTHESIZE write an answer using ONLY those chunks         (→ llm/*)
//     └─▶ 4. CITE       attach which chunks support the answer
//
// The ORDER is the point: the gate runs BEFORE synthesis. A RAG system that always
// answers will always hallucinate on out-of-scope questions. This one can say no —
// and refusal is a normal return value (refused:true), not an exception, so the
// eval-loop can score it.
//
// Down the ladder ▼  next: src/embeddings/local.ts (what "embed the question" means).
// ═══════════════════════════════════════════════════════════════════════════
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
  // LEARN: we surface the numbers the gate judged on even on success — so callers
  // (and the eval artifacts) can SEE what retrieval confidence looked like.
  confidence: { topSimilarity: number; meanSimilarity: number };
}

// LEARN: DI in action — the function asks for exactly what it needs. A test can
// hand it a fake llm/embedder; production hands it the real ones (via Services).
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
  // LEARN: options override config so the eval runner can drive this exact code
  // path with controlled k / thresholds (no separate "eval version" of the logic).
  const k = options.k ?? cfg.SEARCH_TOP_K;
  const thresholds: GateThresholds = options.thresholds ?? {
    minTopSimilarity: cfg.ANSWER_MIN_TOP_SIMILARITY,
    minMeanSimilarity: cfg.ANSWER_MIN_MEAN_SIMILARITY,
  };

  // 1. RETRIEVE — embed the question and cosine-rank the corpus (see search.ts).
  const hits = await searchDocs(deps, question, k);

  // 2. GATE — decide whether we're even allowed to answer, from the similarity
  //    scores alone. This is the whole reliability story (see qa/gate.ts).
  const gate = evaluateConfidence(hits.map((h) => h.score), thresholds);
  const confidence = { topSimilarity: gate.topSimilarity, meanSimilarity: gate.meanSimilarity };

  if (!gate.pass) {
    // LEARN: REFUSE. No LLM call happens. Citations are EMPTY on purpose — we never
    // imply support we don't have. Cheap, early, honest.
    return {
      answer: NOT_FOUND_MESSAGE,
      refused: true,
      reason: gate.reason,
      citations: [],
      confidence,
    };
  }

  // 3. SYNTHESIZE — build the context the answer must be grounded in, then let the
  //    LLM provider (heuristic by default, Ollama optionally) write the answer.
  const contexts: RetrievedContext[] = hits.map((h) => ({
    id: h.id,
    title: h.title,
    source: h.source,
    content: h.content,
    score: h.score,
  }));

  const answer = await deps.llm.synthesize(question, contexts);

  // 4. CITE — the citations are the same chunks we synthesized from. So a "[1]" in
  //    the answer and citations[0] point at the same source chunk.
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
