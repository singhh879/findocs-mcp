// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L3→L4 bridge · SEMANTIC SEARCH = embed the query, then cosine-rank
//
// "Find documents about X" is two steps:
//   1. embed the query into the SAME vector space as the chunks (embeddings/),
//   2. find the chunks whose vectors point most like it (db/repo.vectorSearch).
// That's it. This file is deliberately tiny — the interesting parts are one layer
// down on each side (how text becomes a vector; how pgvector ranks by cosine).
//
// Down the ladder ▼  next: src/embeddings/local.ts, then src/db/repo.ts.
// ═══════════════════════════════════════════════════════════════════════════
import type { Sql } from "../db/client.js";
import { vectorSearch, type SearchHit } from "../db/repo.js";
import { embedOne, type Embedder } from "../embeddings/index.js";

export type { SearchHit } from "../db/repo.js";

export interface SearchDeps {
  sql: Sql;
  embedder: Embedder;
}

/**
 * Semantic search: embed the query, then cosine-ANN over pgvector.
 * Returns top-k chunks with similarity scores and source metadata.
 */
export async function searchDocs(
  deps: SearchDeps,
  query: string,
  k: number,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  // LEARN: the query is embedded with the *same* model as the documents. If query
  // and document embeddings came from different models, their vectors would live in
  // different spaces and cosine similarity would be meaningless.
  const queryVec = await embedOne(deps.embedder, trimmed);
  return vectorSearch(deps.sql, queryVec, k);
}
