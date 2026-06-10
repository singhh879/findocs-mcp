// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L7 · THE GENERATIVE LLM PROVIDER (optional, still free)
//
// Same LLMProvider interface, but answers/judgments come from a LOCAL Ollama model
// (e.g. llama3.2) over HTTP — fluent prose and a real "LLM-as-judge", at zero cost
// and with no API key. The key design move is DEFENSIVE: every call falls back to
// the deterministic HeuristicProvider on any error or unparseable response. So
// enabling Ollama can only IMPROVE quality, never break the pipeline — CI degrades
// gracefully instead of exploding if the model isn't installed.
//
// This is also the template for a future AnthropicProvider/OpenAIProvider: implement
// synthesize() + judge(), register it in the factory (llm/index.ts). Nothing else
// in the codebase changes.
// ═══════════════════════════════════════════════════════════════════════════
import { HeuristicProvider } from "./heuristic.js";
import type { JudgeResult, LLMProvider, RetrievedContext } from "./types.js";

interface OllamaGenerateResponse {
  response?: string;
}

/**
 * Local Ollama provider (free, generative). Synthesizes grounded answers and runs
 * LLM-as-judge faithfulness scoring against a local model, with per-call fallback
 * to the deterministic provider.
 */
export class OllamaProvider implements LLMProvider {
  readonly id: string;
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #fallback = new HeuristicProvider();

  constructor(baseUrl: string, model: string) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#model = model;
    this.id = `ollama:${model}`;
  }

  async #generate(prompt: string, timeoutMs = 60_000): Promise<string> {
    // LEARN: an AbortController gives the fetch a hard timeout — a hung local model
    // shouldn't hang the whole pipeline. On abort/error, callers fall back.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.#baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.#model,
          prompt,
          stream: false,
          // LEARN: temperature 0 → as deterministic as a generative model gets, which
          // matters when this feeds an eval score.
          options: { temperature: 0 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
      const data = (await res.json()) as OllamaGenerateResponse;
      return (data.response ?? "").trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
    if (contexts.length === 0) return "Not found in the indexed documents.";
    // LEARN: the prompt is the grounding contract — number the contexts, demand
    // inline [n] citations, and instruct an explicit refusal phrase when unsupported.
    const block = contexts
      .map((c, i) => `[${i + 1}] (${c.source} — ${c.title})\n${c.content}`)
      .join("\n\n");
    const prompt =
      "You answer strictly from the provided context. Cite sources inline as [n]. " +
      'If the context does not contain the answer, reply exactly "Not found in the indexed documents."\n\n' +
      `Context:\n${block}\n\nQuestion: ${question}\n\nGrounded answer:`;
    try {
      const text = await this.#generate(prompt);
      return text.length > 0 ? text : this.#fallback.synthesize(question, contexts);
    } catch {
      return this.#fallback.synthesize(question, contexts);
    }
  }

  async judge(answer: string, contexts: RetrievedContext[]): Promise<JudgeResult> {
    // LEARN: LLM-as-judge — ask the model to rate support as JSON. We extract the
    // JSON defensively (models love to add prose around it) and clamp to [0,1]; any
    // failure falls back to the deterministic token-coverage judge.
    const block = contexts.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
    const prompt =
      "You are a strict faithfulness judge. Given CONTEXT and an ANSWER, rate how fully " +
      "the answer is supported by the context. Respond with ONLY a JSON object " +
      '{"grounded": <0..1>, "rationale": "<short>"}.\n\n' +
      `CONTEXT:\n${block}\n\nANSWER:\n${answer}\n\nJSON:`;
    try {
      const raw = await this.#generate(prompt, 45_000);
      const match = /\{[\s\S]*\}/.exec(raw);
      if (!match) throw new Error("no JSON in judge response");
      const parsed = JSON.parse(match[0]) as { grounded?: unknown; rationale?: unknown };
      const grounded = typeof parsed.grounded === "number" ? parsed.grounded : Number(parsed.grounded);
      if (!Number.isFinite(grounded)) throw new Error("non-numeric grounded score");
      return {
        grounded: Math.max(0, Math.min(1, grounded)),
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "ollama judge",
      };
    } catch {
      return this.#fallback.judge(answer, contexts);
    }
  }
}
