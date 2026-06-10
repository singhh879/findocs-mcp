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
