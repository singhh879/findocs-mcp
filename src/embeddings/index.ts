import { loadConfig } from "../config.js";
import type { Embedder } from "./types.js";
import { LocalEmbedder } from "./local.js";

export type { Embedder } from "./types.js";
export { embedOne } from "./types.js";

let cached: Embedder | null = null;

/**
 * Build the configured embedder. Today only `local` exists; cloud providers
 * (OpenAI/Voyage) would slot in here behind the same `Embedder` interface
 * without changing any caller.
 */
export function getEmbedder(): Embedder {
  if (cached) return cached;
  const cfg = loadConfig();
  switch (cfg.EMBEDDINGS_PROVIDER) {
    case "local":
      cached = new LocalEmbedder(cfg.EMBEDDINGS_MODEL);
      return cached;
    default: {
      // Exhaustiveness guard: if the enum grows, this fails to typecheck.
      const _exhaustive: never = cfg.EMBEDDINGS_PROVIDER;
      throw new Error(`unsupported embeddings provider: ${String(_exhaustive)}`);
    }
  }
}

/** Test-only reset of the memoized embedder. */
export function resetEmbedderForTests(): void {
  cached = null;
}
