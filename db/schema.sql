-- ════════════════════════════════════════════════════════════════════════════
-- LEARN ▼  L4 · STORAGE & THE ANN INDEX (read alongside src/db/repo.ts)
--
-- Two ideas live in this file:
--   1. pgvector adds a real `vector(N)` column type to Postgres, so embeddings sit
--      in the SAME transactional store as chunk text + metadata. No separate vector
--      DB, no sync problems — retrieval is just SQL.
--   2. The HNSW index makes "find nearest vectors" fast. Comparing the query to
--      EVERY chunk (brute force) is exact but O(N). HNSW (Hierarchical Navigable
--      Small World) is an Approximate Nearest Neighbour index: a multi-layer graph
--      with "express lanes" on top of "local roads"; a search greedily hops toward
--      the query, visiting a tiny fraction of nodes. Tradeoff = recall vs speed,
--      tuned by m / ef_construction (build) and ef_search (query). For our ~64-chunk
--      corpus it's effectively exact; the index earns its keep as the corpus grows.
-- ════════════════════════════════════════════════════════════════════════════

-- FinDocs MCP schema: chunk store + vector index.
-- Embedding dimension is 384 to match all-MiniLM-L6-v2 (the default local embedder).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,                  -- stable hash of (source + ord + content)
  doc_id      TEXT        NOT NULL,              -- logical document id (e.g. zerodha/orders)
  source      TEXT        NOT NULL,              -- corpus source slug (e.g. "zerodha", "finvasia")
  title       TEXT        NOT NULL,              -- human-readable document/section title
  url         TEXT,                              -- canonical source URL, when known
  ord         INTEGER     NOT NULL,              -- chunk order within the document
  content     TEXT        NOT NULL,              -- chunk text
  -- LEARN: vector(384) MUST equal Embedder.dim. A 768-dim model's output would be
  -- rejected here — the schema guards your data.
  embedding   vector(384) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_doc_id_idx ON chunks (doc_id);
CREATE INDEX IF NOT EXISTS chunks_source_idx ON chunks (source);

-- HNSW index for cosine-distance ANN search.
-- LEARN: `vector_cosine_ops` tells HNSW to organize the graph by COSINE distance —
-- it must match the `<=>` operator the query uses (repo.ts). Pairing a cosine query
-- with an L2 opclass is a classic silent vector-search bug. m / ef_construction are
-- the build-time graph-quality knobs.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
