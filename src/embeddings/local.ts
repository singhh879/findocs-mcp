// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L3 · EMBEDDINGS — turning text into vectors you can compare
//
// An EMBEDDING is a fixed-length list of numbers (a vector) that represents a
// piece of text's MEANING, produced by a pre-trained neural network. The defining
// property: texts with similar meaning get vectors that point in similar
// directions. That's the leap past keyword search — "cancel an order" and "delete
// a pending order" land close together despite sharing no words.
//
// Three things to internalize, all visible in embed() below:
//   • DIMENSIONALITY — all-MiniLM-L6-v2 outputs 384 numbers per text. Each is a
//     learned latent feature; together they place the text in a 384-D "meaning
//     space". This 384 MUST match the DB's vector(384) column (see db/schema.sql).
//   • POOLING — a sentence is many tokens, each with its own vector. Mean pooling
//     averages them into one sentence vector.
//   • NORMALIZE — we ask for L2-normalized (length-1) vectors. This is a setup for
//     the next layer: for unit vectors, DOT PRODUCT == COSINE SIMILARITY. So
//     "compare by angle/meaning" becomes a cheap dot product everywhere downstream.
//
// Why LOCAL? No API key, no per-call cost, and fully DETERMINISTIC (same text →
// same vector). Determinism is what makes the eval gate reproducible — a paid
// remote model that drifts under you would make CI flap for non-code reasons.
//
// Down the ladder ▼  next: src/db/repo.ts (how cosine ranking actually happens).
// ═══════════════════════════════════════════════════════════════════════════
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
  // LEARN: the model is loaded lazily and cached in this field — the ~90 MB model
  // download/init happens on the FIRST embed() call, not at construction. That's
  // why building Services is instant.
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
    // LEARN: pooling:"mean" + normalize:true == the two decisions above made real.
    // The output is a Tensor; .tolist() gives plain number[][] (one row per input).
    const output = await pipe(texts, { pooling: "mean", normalize: true });
    const nested = output.tolist() as number[][];
    // LEARN: cheap invariant — one vector out per text in. Catches batching bugs
    // immediately instead of letting a misaligned row poison retrieval silently.
    if (nested.length !== texts.length) {
      throw new Error(
        `embedder returned ${nested.length} vectors for ${texts.length} inputs`,
      );
    }
    return nested;
  }
}
