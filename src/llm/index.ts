import { loadConfig } from "../config.js";
import type { LLMProvider } from "./types.js";
import { HeuristicProvider } from "./heuristic.js";
import { OllamaProvider } from "./ollama.js";

export type { LLMProvider, RetrievedContext, JudgeResult } from "./types.js";
export { HeuristicProvider, judgeGroundedness } from "./heuristic.js";
export { OllamaProvider } from "./ollama.js";

let cached: LLMProvider | null = null;

/**
 * Build the configured LLM provider. Default is the deterministic heuristic
 * provider (zero cost, no secrets); `ollama` opts into a local generative model
 * that itself falls back to heuristic per-call if unreachable.
 */
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;
  const cfg = loadConfig();
  switch (cfg.LLM_PROVIDER) {
    case "heuristic":
      cached = new HeuristicProvider();
      return cached;
    case "ollama":
      cached = new OllamaProvider(cfg.OLLAMA_BASE_URL, cfg.OLLAMA_MODEL);
      return cached;
    default: {
      const _exhaustive: never = cfg.LLM_PROVIDER;
      throw new Error(`unsupported LLM provider: ${String(_exhaustive)}`);
    }
  }
}

/** Test-only reset of the memoized provider. */
export function resetLLMForTests(): void {
  cached = null;
}
