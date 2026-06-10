# L4 · Vector search: cosine, pgvector, HNSW

> **You are here:** we have a question vector and tens of thousands of chunk vectors. We
> descend into *how you find the closest ones* — the geometry of "similar," how Postgres
> stores vectors, and how an index makes the search fast.
>
> **Code for this rung:** [`db/schema.sql`](../../db/schema.sql),
> [`src/db/repo.ts`](../../src/db/repo.ts)

---

## The concept

### 1. "Similar" = small angle = cosine similarity

Each vector is a direction in 384-dimensional space. Two texts are similar when their
vectors **point the same way** — i.e., the *angle* between them is small. We measure that
with **cosine similarity**:

```
cos(θ) = (A · B) / (|A| · |B|)
```

- `A · B` is the **dot product**: multiply matching components and sum them.
- `|A|` is the vector's **length** (magnitude).
- Result ranges from **−1** (opposite) through **0** (unrelated/orthogonal) to **+1**
  (identical direction).

Because L3 hands us **unit vectors** (`|A| = |B| = 1`), the denominator is 1 and
**cosine = dot product**. That's the efficiency trick: comparing meanings becomes a plain
dot product. The full worked arithmetic is in the
[appendix](90-appendix-cosine-from-scratch.md).

**Cosine distance** is just `1 − cosine similarity`: 0 = identical, 2 = opposite. Indexes
sort by *distance* (smaller = closer); we convert back to *similarity* for humans.

### 2. pgvector: vectors as a Postgres column type

[pgvector](https://github.com/pgvector/pgvector) is a Postgres extension adding a real
`vector` column type and distance operators. The key one here:

- `<=>` → **cosine distance** between two vectors.

So "find the 5 chunks most similar to this query vector" is literally an `ORDER BY
embedding <=> query LIMIT 5`. Your similarity search is *SQL*. That's a big deal: no
separate vector database, no sync problems — your chunks, metadata, and vectors live in
one transactional store.

### 3. HNSW: finding neighbours without scanning everything

Comparing the query against *every* chunk (a "flat" / brute-force scan) is exact but
O(N). For large N you want **Approximate Nearest Neighbour (ANN)** search. **HNSW**
(Hierarchical Navigable Small World) is a graph index: vectors are nodes connected to
their neighbours across several layers (think "express lanes" on top of "local roads").
A search greedily hops toward the query, descending layers — visiting a *tiny* fraction
of nodes to find *almost always* the true nearest neighbours.

The tradeoff is **recall vs. speed**, tuned by:
- `m` — neighbours per node (graph connectivity).
- `ef_construction` — effort when *building* the index (higher = better graph, slower
  build).
- `ef_search` — effort when *querying* (higher = better recall, slower query).

For our ~64-chunk corpus HNSW is effectively exact; the index earns its keep as the
corpus grows.

---

## In this codebase

### Storage + index: `db/schema.sql`

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
  ...
  embedding vector(384) NOT NULL,
  ...
);

CREATE INDEX chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Three things to read closely:
- `vector(384)` — the width must equal `Embedder.dim` (L3). A mismatch is a hard error on
  insert. That's the invariant L3 asked you about.
- `vector_cosine_ops` — tells HNSW to organize the graph by **cosine** distance (there
  are also L2 and inner-product opclasses). It must match the `<=>` operator you query
  with.
- `m`, `ef_construction` — the HNSW knobs from the concept section, set at build time.

### Query: `src/db/repo.ts` → `vectorSearch`

```ts
const rows = await sql`
  SELECT id, ..., 1 - (embedding <=> ${vec}::vector) AS score
  FROM chunks
  ORDER BY embedding <=> ${vec}::vector
  LIMIT ${k}
`;
```

- `ORDER BY embedding <=> query` → nearest by cosine distance (uses the HNSW index).
- `1 - (embedding <=> query)` → convert distance back to a **similarity score** in
  `[0,1]`-ish that the rest of the app (and the gate, L6) reasons about.
- `${vec}::vector` → we pass the embedding as a string literal `'[0.1,0.2,...]'` and cast
  it. See `toVectorLiteral()` just above — that's the only "serialization" the vector
  needs.

### Write path: `upsertChunks`

Bulk `INSERT ... ON CONFLICT (id) DO UPDATE`. Two lessons here:
- The embedding goes in as the same `'[...]'` literal; Postgres coerces it into the
  `vector` column.
- `ON CONFLICT (id)` makes ingestion **idempotent** — re-running it overwrites in place
  rather than duplicating. (Why `id` is deterministic is L5.)

---

## Trace it yourself

- **The SQL, end-to-end (needs Docker):**
  ```bash
  pnpm db:up && pnpm db:wait && pnpm migrate && pnpm ingest
  ```
  Then open a `psql` and run the search by hand:
  ```sql
  EXPLAIN ANALYZE
  SELECT id, 1 - (embedding <=> (SELECT embedding FROM chunks LIMIT 1)) AS score
  FROM chunks
  ORDER BY embedding <=> (SELECT embedding FROM chunks LIMIT 1)
  LIMIT 5;
  ```
  `EXPLAIN ANALYZE` shows whether the **HNSW index** is used and how fast it is.
- **The integration test** [`test/repo.integration.test.ts`](../../test/repo.integration.test.ts)
  is a runnable spec of this layer: it inserts two one-hot 384-d vectors, searches near
  one, and asserts it ranks first with score ≈ 1. It runs automatically in CI (where
  pgvector is up) and skips locally without `DATABASE_URL`.
- **No Docker?** `pnpm calibrate` computes the *exact same* cosine ranking in memory
  (`dot()` over normalized vectors). Same math, no database — useful to confirm your
  mental model before touching SQL.

---

## Break it

1. **Wrong opclass.** Change `vector_cosine_ops` to `vector_l2_ops` in `schema.sql`, but
   keep querying with `<=>` (cosine). Re-migrate and re-run the integration test in CI (or
   reason it through): the index no longer matches the query metric, so it can't be used
   correctly — a classic, silent vector-search bug.
2. **Dimension mismatch.** Imagine swapping in a 768-dim model without changing
   `vector(384)`. The insert throws. Good — the schema is guarding your data.

---

## Exercises

- Explain `<=>` vs `<->` vs `<#>` in pgvector (cosine, L2, negative inner product). Which
  one pairs with unit-normalized embeddings, and why does it not matter much once vectors
  are normalized?
- Raise `ef_search` (a session setting: `SET hnsw.ef_search = 100;`) and describe what you
  trade. When would you bother, given our corpus size?

---

## Go deeper (the next rung down)

We've been assuming "chunks" exist. But documents are long — *where do chunks come from*,
and why is each chunk's `id` deterministic (so upserts can be idempotent)? Descend to
**[L5 · Chunking & ingestion →](05-chunking-and-ingestion.md)**.

**Foundational references (optional):** the HNSW paper (Malkov & Yashunin, 2016); the
pgvector README on index types and `ef_search`.
