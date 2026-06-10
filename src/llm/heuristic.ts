// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L7 · THE DETERMINISTIC LLM PROVIDER (default, zero-cost)
//
// This is the CI/eval default and a legitimate, auditable strategy — not a toy.
//   • synthesize() is EXTRACTIVE: it picks the context sentences most relevant to
//     the question (by token overlap, see src/text.ts) and stitches them together
//     with inline [n] citation markers. No model, no cost, perfectly reproducible.
//   • judge() scores GROUNDEDNESS by measuring how much of each answer sentence is
//     covered by the retrieved context tokens. A deterministic stand-in for
//     "LLM-as-judge" that keeps the eval gate stable and free in CI.
//
// Because both are pure functions of their inputs, eval scores are perfectly
// reproducible — which is the entire point of the regression gate. Swap in Ollama
// (llm/ollama.ts) for fluent generative answers + a real model judge when you want.
// ═══════════════════════════════════════════════════════════════════════════
import { contentTokens, coverage, splitSentences } from "../text.js";
import type { JudgeResult, LLMProvider, RetrievedContext } from "./types.js";

/**
 * Deterministic, zero-dependency LLM provider.
 *
 * `synthesize` is extractive; `judge` measures groundedness as mean token-coverage
 * of each answer sentence by the retrieved contexts. Both are pure => reproducible.
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
        // LEARN: relevance ≈ how many of the question's content words appear in the
        // sentence (overlap). Crude vs an LLM, but transparent and deterministic.
        const overlap = coverage(qTokens, contentTokens(sentence));
        // LEARN: a tiny rank bias breaks ties STABLY (higher-ranked context wins),
        // so the same question always produces byte-identical output.
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
      // LEARN: [n] ties the sentence back to contexts[n-1]; answer.ts builds the
      // matching citations[] from the same hits, so [1] and citations[0] agree.
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
  // LEARN: strip the [n] markers, then for EACH answer sentence find its best
  // token-coverage against any context. Fully supported (≥0.6) counts 1, partially
  // (≥0.3) counts ½, else 0. Average = groundedness. (An LLM judge would be smarter
  // about meaning — which is why faithfulness is ONE metric among several, not the
  // only one. See its limits in the eval-loop discussion.)
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
