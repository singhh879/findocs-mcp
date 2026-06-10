/**
 * Provider-agnostic embedding interface.
 *
 * Implementations must return L2-normalized vectors so callers can treat dot
 * product as cosine similarity. Keeping this surface tiny is what makes the
 * provider swappable (local model today, OpenAI/Voyage later) without touching
 * retrieval or ingest code.
 */
export interface Embedder {
  /** Embedding dimensionality (must match the DB `vector(N)` column). */
  readonly dim: number;
  /** A stable identifier for the model, recorded in eval artifacts. */
  readonly id: string;
  /** Embed a batch of texts. Returns one normalized vector per input, in order. */
  embed(texts: string[]): Promise<number[][]>;
}

/** Convenience: embed a single text. */
export async function embedOne(embedder: Embedder, text: string): Promise<number[]> {
  const [vec] = await embedder.embed([text]);
  if (!vec) throw new Error("embedder returned no vector");
  return vec;
}
