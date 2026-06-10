// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L7 · THE LLM ADAPTER BOUNDARY — synthesize + judge
//
// "Grounded" means the answer is built ONLY from the retrieved context, not from a
// model's free-floating memory. The citations point at the exact chunks that support
// each claim, so a human can verify. This interface gives the LLM two jobs:
//   • synthesize(question, contexts) → write a grounded answer.
//   • judge(answer, contexts)        → score how well the answer is SUPPORTED by the
//                                       context (faithfulness), 0..1. This is the
//                                       "LLM-as-judge" technique used in modern evals.
//
// Two implementations ship behind this one interface (the ADAPTER pattern):
//   • heuristic — deterministic, zero-dependency. CI/eval default.
//   • ollama    — local generative model (free), with per-call fallback to heuristic.
// A cloud provider (Anthropic/OpenAI) would implement this SAME interface — and only
// the factory (llm/index.ts) would change. That's how "zero-cost now, upgradeable
// later" was achievable without a rewrite.
// ═══════════════════════════════════════════════════════════════════════════

/** A retrieved chunk passed to the LLM for grounded synthesis / judging. */
export interface RetrievedContext {
  id: string;
  title: string;
  source: string;
  content: string;
  score: number;
}

/** Result of the faithfulness judge. */
export interface JudgeResult {
  /** Groundedness in [0,1]: how well the answer is supported by the contexts. */
  grounded: number;
  rationale: string;
}

/**
 * Provider-agnostic LLM surface. Two implementations ship:
 *  - heuristic: deterministic, zero-dependency (CI/eval default)
 *  - ollama: local generative model (free), with graceful fallback
 *
 * Cloud providers (Anthropic/OpenAI) would implement this same interface.
 */
export interface LLMProvider {
  /** Stable identifier recorded in eval artifacts. */
  readonly id: string;
  /** Produce a grounded answer from the question and retrieved contexts. */
  synthesize(question: string, contexts: RetrievedContext[]): Promise<string>;
  /** Score how well `answer` is supported by `contexts` (faithfulness). */
  judge(answer: string, contexts: RetrievedContext[]): Promise<JudgeResult>;
}
