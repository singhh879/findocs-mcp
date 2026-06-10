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
  embedding   vector(384) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_doc_id_idx ON chunks (doc_id);
CREATE INDEX IF NOT EXISTS chunks_source_idx ON chunks (source);

-- HNSW index for cosine-distance ANN search.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
