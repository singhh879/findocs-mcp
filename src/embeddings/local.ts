// LEARN ▸ docs/learning/03-embeddings.md — text → 384-dim unit vectors (mean pooling + L2 normalize)
import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";
import type { Embedder } from "./types.js";

// Allow downloading models from the HF hub and cache them on disk so repeated
// runs (and CI, with a cache step) don't re-download.
env.allowLocalModels = false;
env.cacheDir = process.env["TRANSFORMERS_CACHE"] ?? ".models";

/**
 * Local, zero-cost embedder backed by @xenova/transformers.
 * Default model is all-MiniLM-L6-v2 (384-dim), a strong small retrieval model.
 */
export class LocalEmbedder implements Embedder {
  readonly dim = 384;
  readonly id: string;
  readonly #modelName: string;
  #pipe: FeatureExtractionPipeline | null = null;

  constructor(modelName: string) {
    this.#modelName = modelName;
    this.id = `local:${modelName}`;
  }

  async #pipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.#pipe) {
      this.#pipe = await pipeline("feature-extraction", this.#modelName);
    }
    return this.#pipe;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipe = await this.#pipeline();
    // mean pooling + L2 normalize => unit vectors, so dot product == cosine.
    const output = await pipe(texts, { pooling: "mean", normalize: true });
    const nested = output.tolist() as number[][];
    if (nested.length !== texts.length) {
      throw new Error(
        `embedder returned ${nested.length} vectors for ${texts.length} inputs`,
      );
    }
    return nested;
  }
}
