// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L4 · VECTOR SEARCH — cosine similarity over pgvector (+ the math)
//
// We have a query vector and tens of thousands of chunk vectors. "Most similar"
// means "points the most like mine", measured by COSINE SIMILARITY:
//
//     cos(θ) = (A · B) / (|A| · |B|)
//   • A · B  = dot product = Σ aᵢ·bᵢ   (multiply matching components, sum)
//   • |A|    = magnitude   = √(Σ aᵢ²)
//   • range  = -1 (opposite) ... 0 (unrelated) ... +1 (identical direction)
//
// THE SHORTCUT this whole system rests on: the embedder returns UNIT vectors
// (|A|=|B|=1), so the denominator is 1 and cosine == plain dot product. Cheap.
//
// pgvector gives Postgres a real `vector` type and a cosine-distance operator
// `<=>`. COSINE DISTANCE = 1 - cosine similarity (0=identical, 2=opposite). Indexes
// sort by distance (smaller=closer); we convert back to similarity for humans with
// `1 - (embedding <=> query)`. So "semantic search" is literally an ORDER BY.
//
// Down the ladder ▼  the absolute bottom is just dot products of unit vectors —
// see how the offline calibrate.ts ranks with a 3-line dot() and gets the same
// answer pgvector does.
// ═══════════════════════════════════════════════════════════════════════════
import type { Sql } from "./client.js";

/** A stored document chunk (without its embedding). */
export interface ChunkRecord {
  id: string;
  docId: string;
  source: string;
  title: string;
  url: string | null;
  ord: number;
  content: string;
}

/** A chunk ready to be persisted, including its embedding vector. */
export interface ChunkInput extends ChunkRecord {
  embedding: number[];
}

/** A search hit: a chunk plus its cosine similarity to the query (0..1). */
export interface SearchHit extends ChunkRecord {
  score: number;
}

// LEARN: pgvector accepts a vector as the text literal `[0.1,0.2,...]`. This is the
// only "serialization" a vector needs on the way into / out of SQL.
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Upsert a batch of chunks in a single statement. Idempotent on `id` — re-ingesting
 * the same content overwrites in place, so ingestion is safe to re-run.
 */
export async function upsertChunks(sql: Sql, chunks: ChunkInput[]): Promise<number> {
  if (chunks.length === 0) return 0;
  const rows = chunks.map((c) => ({
    id: c.id,
    doc_id: c.docId,
    source: c.source,
    title: c.title,
    url: c.url,
    ord: c.ord,
    content: c.content,
    embedding: toVectorLiteral(c.embedding),
  }));

  // LEARN: ON CONFLICT (id) DO UPDATE = upsert. Because chunk ids are a hash of
  // content (see ingest/pipeline.ts), re-ingesting unchanged docs collides on the
  // same ids and overwrites in place — no duplicates. That's idempotency.
  await sql`
    INSERT INTO chunks ${sql(rows, "id", "doc_id", "source", "title", "url", "ord", "content", "embedding")}
    ON CONFLICT (id) DO UPDATE SET
      doc_id    = EXCLUDED.doc_id,
      source    = EXCLUDED.source,
      title     = EXCLUDED.title,
      url       = EXCLUDED.url,
      ord       = EXCLUDED.ord,
      content   = EXCLUDED.content,
      embedding = EXCLUDED.embedding
  `;
  return rows.length;
}

interface SearchRow {
  id: string;
  doc_id: string;
  source: string;
  title: string;
  url: string | null;
  ord: number;
  content: string;
  score: string; // numeric comes back as string from postgres.js
}

/**
 * Cosine-similarity ANN search over the HNSW index.
 * Returns the top-k chunks ordered by descending similarity (1 - cosine distance).
 */
export async function vectorSearch(
  sql: Sql,
  queryEmbedding: number[],
  k: number,
): Promise<SearchHit[]> {
  const vec = toVectorLiteral(queryEmbedding);
  // LEARN: the two key lines:
  //   • ORDER BY embedding <=> vec  → nearest by COSINE DISTANCE (uses HNSW index)
  //   • 1 - (embedding <=> vec)     → convert distance back to a 0..1 SIMILARITY
  // `::vector` casts our text literal to the pgvector type so `<=>` applies.
  const rows = await sql<SearchRow[]>`
    SELECT
      id, doc_id, source, title, url, ord, content,
      1 - (embedding <=> ${vec}::vector) AS score
    FROM chunks
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${k}
  `;
  return rows.map((r) => ({
    id: r.id,
    docId: r.doc_id,
    source: r.source,
    title: r.title,
    url: r.url,
    ord: r.ord,
    content: r.content,
    score: Number(r.score),
  }));
}

/** Fetch a single chunk by id (used to resolve citations). */
export async function getChunk(sql: Sql, id: string): Promise<ChunkRecord | null> {
  const rows = await sql<Omit<SearchRow, "score">[]>`
    SELECT id, doc_id, source, title, url, ord, content
    FROM chunks WHERE id = ${id}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    docId: r.doc_id,
    source: r.source,
    title: r.title,
    url: r.url,
    ord: r.ord,
    content: r.content,
  };
}

/** Total chunk count (used by CLIs/eval to confirm ingestion happened). */
export async function countChunks(sql: Sql): Promise<number> {
  const rows = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM chunks`;
  return Number(rows[0]?.n ?? "0");
}
