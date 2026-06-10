// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L3 · THE ADAPTER BOUNDARY for embeddings
//
// This interface is intentionally TINY. That smallness is exactly what makes the
// provider swappable: anything that can turn strings into equal-length number
// arrays is an Embedder — local MiniLM today, OpenAI/Voyage tomorrow — and no
// caller (search, ingest) needs to change. This is the "program to an interface,
// not an implementation" rule, applied to ML.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Provider-agnostic embedding interface.
 *
 * Implementations must return L2-normalized vectors so callers can treat dot
 * product as cosine similarity. Keeping this surface tiny is what makes the
 * provider swappable (local model today, OpenAI/Voyage later) without touching
 * retrieval or ingest code.
 */
export interface Embedder {
  // LEARN: must equal the DB `vector(N)` column width. A mismatch is a hard error
  // on insert — the type system can't catch it, so we make it an explicit field.
  readonly dim: number;
  // LEARN: recorded in eval artifacts so every score is attributable to a model.
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
