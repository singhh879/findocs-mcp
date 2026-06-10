// LEARN ▸ docs/learning/07-grounded-synthesis-and-citations.md — extractive synthesis + groundedness judge
import { contentTokens, coverage, splitSentences } from "../text.js";
import type { JudgeResult, LLMProvider, RetrievedContext } from "./types.js";

/**
 * Deterministic, zero-dependency LLM provider.
 *
 * `synthesize` is extractive: it selects the context sentences most relevant to
 * the question and stitches them into an answer with inline `[n]` citations.
 * `judge` measures groundedness as the mean token-coverage of each answer
 * sentence by the retrieved contexts.
 *
 * Because both are pure functions of their inputs, eval scores are perfectly
 * reproducible — which is the whole point of the regression gate.
 */
export class HeuristicProvider implements LLMProvider {
  readonly id = "heuristic:v1";
  readonly #maxSentences: number;

  constructor(maxSentences = 4) {
    this.#maxSentences = maxSentences;
  }

  async synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
    if (contexts.length === 0) return "Not found in the indexed documents.";
    const qTokens = new Set(contentTokens(question));

    interface Candidate {
      sentence: string;
      ctxIndex: number;
      score: number;
    }
    const candidates: Candidate[] = [];
    contexts.forEach((ctx, ctxIndex) => {
      for (const sentence of splitSentences(ctx.content)) {
        const overlap = coverage(qTokens, contentTokens(sentence));
        // Bias slightly toward higher-ranked contexts to break ties stably.
        const score = overlap + (contexts.length - ctxIndex) * 1e-3;
        candidates.push({ sentence, ctxIndex, score });
      }
    });

    candidates.sort((a, b) => b.score - a.score);
    const picked = candidates.filter((c) => c.score > 0).slice(0, this.#maxSentences);
    const chosen = picked.length > 0 ? picked : candidates.slice(0, 1);

    const seen = new Set<string>();
    const lines: string[] = [];
    for (const c of chosen) {
      const key = c.sentence.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`${c.sentence} [${c.ctxIndex + 1}]`);
    }
    return lines.join(" ");
  }

  async judge(answer: string, contexts: RetrievedContext[]): Promise<JudgeResult> {
    return Promise.resolve(judgeGroundedness(answer, contexts));
  }
}

/** Exported for direct unit testing and reuse as the eval-time fallback judge. */
export function judgeGroundedness(
  answer: string,
  contexts: RetrievedContext[],
): JudgeResult {
  const sentences = splitSentences(answer.replace(/\[\d+\]/g, ""));
  if (sentences.length === 0 || contexts.length === 0) {
    return { grounded: 0, rationale: "no answer sentences or no contexts" };
  }
  const contextTokenSets = contexts.map((c) => contentTokens(c.content));

  let total = 0;
  let supported = 0;
  for (const sentence of sentences) {
    const tokens = contentTokens(sentence);
    if (tokens.length === 0) continue;
    total++;
    const best = Math.max(0, ...contextTokenSets.map((ct) => coverage(tokens, ct)));
    if (best >= 0.6) supported++;
    else if (best >= 0.3) supported += 0.5;
  }
  const grounded = total === 0 ? 0 : supported / total;
  return {
    grounded: Number(grounded.toFixed(4)),
    rationale: `${supported}/${total} answer sentences supported by retrieved context`,
  };
}
