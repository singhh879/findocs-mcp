// LEARN ▸ docs/learning/04-vector-search-cosine-pgvector-hnsw.md — cosine search over pgvector
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

/** Format a JS number[] as a pgvector literal: `[0.1,0.2,...]`. */
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
