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
  const queryVec = await embedOne(deps.embedder, trimmed);
  return vectorSearch(deps.sql, queryVec, k);
}
