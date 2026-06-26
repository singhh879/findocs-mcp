# FinDocs MCP — Learning Roadmap

> A guided tour of the **learning layer** baked into this codebase. The source is
> written as a *reverse-learning layer*: every file opens with a `LEARN ▼` block that
> teaches the concept right where it's implemented. This document is the **map** for
> that descent — the order to read in, an in-depth breakdown of each file, and
> plain-English explanations of the concepts (embeddings, cosine similarity,
> normalization, chunking, the refusal gate, eval metrics, …).

If you only remember one thing: **read top-down, from where an agent calls in
(`src/mcp/server.ts`) to the linear algebra at the bottom (`src/db/repo.ts`).** Each
level builds on the one below it.

---

## How the codebase teaches itself

Every core file starts with a banner comment:

```
// ═══════════════════════════════════════════════════════════════════════
// LEARN ▼  L4 · VECTOR SEARCH — cosine similarity over pgvector (+ the math)
// ...
// Down the ladder ▼  next: <the file to read next>
// ═══════════════════════════════════════════════════════════════════════
```

- The **`L#`** is the depth in the ladder (L0 = the surface an agent touches, L10 =
  config/boundaries at the bottom).
- Inline `// LEARN:` comments explain individual lines.
- Many blocks end with a **"break it"** suggestion — a deliberate change that makes a
  concept visible by watching it fail.

The fastest way to *see* the whole pipeline at once with **zero setup** (no Docker,
no API keys) is `pnpm calibrate` — it runs embed → rank → gate → synthesize → judge
in memory and prints a scorecard. Read [`scripts/calibrate.ts`](scripts/calibrate.ts)
next to [`src/qa/answer.ts`](src/qa/answer.ts); they are the same four steps.

---

## The reading order (the ladder)

Read in this order. The "why" column says what new idea each file introduces.

| #  | Level | File | What you learn |
|----|-------|------|----------------|
| 1  | L0–L1 | [`src/mcp/server.ts`](src/mcp/server.ts) | What MCP is; how an agent calls a tool over stdio |
| 2  | L2    | [`src/services.ts`](src/services.ts) | Dependency injection — the `{sql, embedder, llm}` bundle |
| 3  | L2    | [`src/qa/answer.ts`](src/qa/answer.ts) | **The RAG pipeline**: retrieve → gate → synthesize → cite |
| 4  | L3→L4 | [`src/retrieval/search.ts`](src/retrieval/search.ts) | Semantic search = embed the query, then cosine-rank |
| 5  | L3    | [`src/embeddings/local.ts`](src/embeddings/local.ts) | **Embeddings** — turning text into comparable vectors |
| 6  | L3    | [`src/embeddings/types.ts`](src/embeddings/types.ts) · [`index.ts`](src/embeddings/index.ts) | The adapter boundary + the exhaustiveness trick |
| 7  | L4    | [`src/db/repo.ts`](src/db/repo.ts) | **Cosine similarity** & vector search in SQL |
| 8  | L4    | [`db/schema.sql`](db/schema.sql) | pgvector storage + the **HNSW** ANN index |
| 9  | L5    | [`src/ingest/chunk.ts`](src/ingest/chunk.ts) | **Chunking** — why & how documents get split |
| 10 | L5    | [`src/ingest/pipeline.ts`](src/ingest/pipeline.ts) | The ingest assembly line + content-addressed IDs |
| 11 | L5    | [`src/ingest/load.ts`](src/ingest/load.ts) | Loading the corpus; the eval contract |
| 12 | L6    | [`src/qa/gate.ts`](src/qa/gate.ts) | **The refusal gate** — the reliability core |
| 13 | L7    | [`src/llm/types.ts`](src/llm/types.ts) | The LLM adapter: `synthesize` + `judge` |
| 14 | L7    | [`src/llm/heuristic.ts`](src/llm/heuristic.ts) | A deterministic, zero-cost LLM stand-in |
| 15 | L7    | [`src/text.ts`](src/text.ts) | Token math: tokenize, Jaccard, coverage |
| 16 | L8    | [`evals/harness/metrics.ts`](evals/harness/metrics.ts) | **Eval metrics**: recall@k, MRR, faithfulness, refusal |
| 17 | L8    | [`evals/harness/runner.ts`](evals/harness/runner.ts) | Scoring the *real* system, not a copy |
| 18 | L8/L9 | [`evals/harness/gate.ts`](evals/harness/gate.ts) | **The regression gate** that fails CI |
| 19 | L10   | [`src/config.ts`](src/config.ts) | Validate at the boundary, trust the inside |
| 20 | —     | [`scripts/calibrate.ts`](scripts/calibrate.ts) | The no-database sandbox that ties it all together |

**Short on time?** Read 1 → 3 → 5 → 7 → 12 → 16. That's the spine: MCP, the
pipeline, embeddings, cosine search, the gate, and the metrics.

---

## In-depth breakdown of each file

### L0–L1 · The surface — `src/mcp/server.ts`

The very top of the system: the part Claude Desktop / Claude Code actually talks to.

- **MCP (Model Context Protocol)** is "USB for AI tools": you run a small server that
  advertises a list of tools, and any MCP-aware client can discover and call them.
- Three moving parts:
  1. **Transport — stdio.** The client spawns this file as a subprocess and exchanges
     JSON-RPC 2.0 messages over stdin/stdout. **Golden rule:** never write to stdout
     except protocol messages — a stray `console.log` corrupts the stream. All logs go
     to stderr via `log()`.
  2. **Discovery.** On connect, the client asks "what tools?" and the server answers
     with each tool's name, description, and input JSON Schema. The model reads those
     to decide *when* and *how* to call — so good descriptions are part of the product.
  3. **Invocation.** The client sends `{name, arguments}`; the SDK validates args
     against the schema *before* the handler runs.
- Registers three tools: `search_docs`, `answer_question` (the flagship), `ingest_doc`.
- `createServices()` is called here but **does not connect to Postgres or load the
  model** — those are lazy, which is why the server starts instantly.

### L2 · Dependency injection — `src/services.ts`

The business logic never reaches out and grabs a database or a model — it **receives**
them in a `deps` object. That's dependency injection (DI), and it buys:

- **Testable** — a test passes a fake `llm`/`embedder`; no network, no Docker.
- **Swappable** — local vs cloud embedder, heuristic vs Ollama LLM, decided once here.
- **Honest** — a function's signature tells you exactly what it can touch.

Each `get*()` is a lazy, memoized **factory**: building `Services` opens no connection
and loads no model until first real use.

### L2 · The answer pipeline — `src/qa/answer.ts`

**The heart of RAG (Retrieval-Augmented Generation)** — and notice it's mostly
plumbing + policy, not magic. A grounded-QA request is a fixed sequence:

```
question
  ├─▶ 1. RETRIEVE    embed the question, find top-k similar chunks   (search.ts)
  ├─▶ 2. GATE        is retrieval confident enough to answer at all? (qa/gate.ts)
  │        └─ no ──▶ REFUSE ("not found")            ◀── the reliability core
  ├─▶ 3. SYNTHESIZE  write an answer using ONLY those chunks         (llm/*)
  └─▶ 4. CITE        attach which chunks support the answer
```

**The order is the point: the gate runs *before* synthesis.** A RAG system that always
answers will always hallucinate on out-of-scope questions. Here, **refusal is a normal
return value** (`refused: true`), not an exception — so the eval-loop can score it.
The function also surfaces the `confidence` numbers it judged on even on success.

### L3→L4 bridge · Semantic search — `src/retrieval/search.ts`

"Find documents about X" is just two steps:

1. embed the query into the **same** vector space as the chunks, then
2. find the chunks whose vectors point most like it (`vectorSearch`).

Deliberately tiny. The one critical invariant: the query is embedded with the **same
model** as the documents — otherwise the vectors live in different spaces and cosine
similarity is meaningless.

### L3 · Embeddings — `src/embeddings/local.ts`

> **Concept: what is an embedding?**
> A fixed-length list of numbers (a vector) that represents a piece of text's
> *meaning*, produced by a pre-trained neural network. The defining property: texts
> with similar meaning get vectors that point in similar directions. That's the leap
> past keyword search — "cancel an order" and "delete a pending order" land close
> together despite sharing no words.

Three things this file makes concrete (all in `embed()`):

- **Dimensionality** — `all-MiniLM-L6-v2` outputs **384** numbers per text. Each is a
  learned latent feature; together they place the text in a 384-D "meaning space."
  This 384 **must** match the DB's `vector(384)` column.
- **Pooling** — a sentence is many tokens, each with its own vector. **Mean pooling**
  averages them into one sentence vector (`pooling: "mean"`).
- **Normalization** — the embedder is asked for **L2-normalized** (length-1) vectors
  (`normalize: true`). See the breakdown below — this is the setup that makes cosine
  similarity cheap downstream.

The model loads **lazily** on the first `embed()` call (~90 MB, cached under
`.models/`). Local embeddings are chosen because they're free, key-less, and
**deterministic** (same text → same vector) — and determinism is what makes the eval
gate reproducible in CI.

### L3 · The embeddings adapter — `src/embeddings/types.ts` & `index.ts`

- `types.ts` defines a deliberately **tiny** `Embedder` interface: `dim`, `id`, and
  `embed(texts) → vectors`. That smallness is exactly what makes the provider
  swappable (local MiniLM today, OpenAI/Voyage tomorrow) without touching any caller.
  This is "program to an interface, not an implementation," applied to ML.
- `index.ts` is the **factory**: read config, build the configured embedder, memoize.
  Note the **exhaustiveness trick** — `const _exhaustive: never = cfg.PROVIDER` in the
  `default` case. If every enum case is handled, the value *is* `never` and it
  compiles. Add a new provider to the enum and this line stops compiling until you
  handle it. The compiler forces completeness.

### L4 · Vector search & the math — `src/db/repo.ts`

> **Concept: cosine similarity.**
> Given a query vector and tens of thousands of chunk vectors, "most similar" means
> "points the most like mine," measured by the angle between them:
>
> ```
> cos(θ) = (A · B) / (|A| · |B|)
>   A · B = dot product = Σ aᵢ·bᵢ      (multiply matching components, sum)
>   |A|   = magnitude   = √(Σ aᵢ²)
>   range = -1 (opposite) … 0 (unrelated) … +1 (identical direction)
> ```

**The shortcut the whole system rests on:** because the embedder returns **unit
vectors** (`|A| = |B| = 1`), the denominator is 1 and **cosine == plain dot product**.
Cheap everywhere.

- pgvector gives Postgres a real `vector` type and a cosine-distance operator `<=>`.
- **Cosine distance = 1 − cosine similarity** (0 = identical, 2 = opposite). Indexes
  sort by distance (smaller = closer); the query converts back to a human-friendly
  0..1 similarity with `1 - (embedding <=> query)`.
- So "semantic search" is literally an `ORDER BY embedding <=> query LIMIT k`.

Also here: `upsertChunks` with `ON CONFLICT (id) DO UPDATE` — because chunk IDs are a
hash of content, re-ingesting unchanged docs collides on the same IDs and overwrites
in place. That's **idempotency**: ingestion is safe to re-run.

### L4 · Storage & the ANN index — `db/schema.sql`

Two ideas:

1. pgvector adds a real `vector(N)` column, so embeddings sit in the **same
   transactional store** as chunk text + metadata — no separate vector DB, no sync
   problems. `vector(384)` **must** equal `Embedder.dim`; a mismatch is a hard error
   on insert.
2. **HNSW (Hierarchical Navigable Small World)** makes "find nearest vectors" fast.
   Comparing the query to *every* chunk (brute force) is exact but O(N). HNSW is an
   **Approximate Nearest Neighbour (ANN)** index: a multi-layer graph with "express
   lanes" on top of "local roads"; a search greedily hops toward the query, visiting a
   tiny fraction of nodes. Tradeoff = recall vs speed, tuned by `m` / `ef_construction`
   (build) and `ef_search` (query).
   - `vector_cosine_ops` tells HNSW to organize by **cosine** distance — it must match
     the `<=>` operator the query uses. Pairing a cosine query with an L2 opclass is a
     classic silent vector-search bug.

### L5 · Chunking — `src/ingest/chunk.ts`

> **Concept: why chunk at all?**
> You don't embed a whole 5-page document as one vector. (a) **Retrieval precision** —
> one vector for a long doc averages many topics into a blurry point; smaller chunks
> each capture one idea, so the right *passage* ranks highly. (b) **Grounding
> precision** — the answer cites the chunk it used; smaller chunks = tighter,
> checkable citations. But too small loses context. Chunking is a precision/context
> tradeoff; the unit of that tradeoff is **size + boundaries**.

- **Good boundaries:** don't cut every N characters (that slices sentences/headings in
  half). Split on document **structure** (markdown headings) first, then only *window*
  oversized sections — with a small **overlap** (default 150 chars) so a fact
  straddling a boundary still appears whole in at least one chunk.
- Defaults `maxChars: 1200, overlap: 150` are a **retrieval-quality lever** — shrink
  them and recall/MRR shift; tuning is a measurable experiment, not a guess.
- This is a **pure function**: same input → same chunks, every run. That determinism
  is what makes evals comparable and lets the pipeline derive stable content-hash IDs.

### L5 · The ingest pipeline — `src/ingest/pipeline.ts`

The assembly line that fills the corpus. Per document: `chunkMarkdown()` →
`embedder.embed()` → `upsertChunks()`. Two reliability details:

- **Deterministic IDs** — `chunkId()` hashes `(source + docId + ord + content)` with
  SHA-256 (content-addressed, like git). A chunk's identity *is* its content, so
  re-ingesting unchanged docs collides on `ON CONFLICT (id)` and overwrites in place →
  **idempotent, no duplicates**. (Break it: add `Date.now()` to the hash and watch the
  corpus duplicate on every run.)
- **Batched embedding** — chunks are embedded in groups of `EMBED_BATCH = 32` to bound
  memory and amortize the per-call model cost.

### L5 · Loading sources — `src/ingest/load.ts`

Everything ingested is normalized into one shape: `SourceDocument
{docId, source, title, url, markdown}`. Three entry points build it:

- `loadCorpusDir()` — walk `corpus/*.md`, parse tiny frontmatter, derive `docId` from
  the file path (e.g. `zerodha/gtt`). **That `docId` is what the eval set's
  `expected_sources` match against — so the corpus layout *is* the eval contract.**
- `documentFromText()` — inline text (the `ingest_doc` tool, text form).
- `documentFromUrl()` — fetch + crude HTML→text (the `ingest_doc` tool, url form).

The corpus is **vendored** (committed) on purpose: evals must score against a fixed,
offline set, or "did retrieval get better?" becomes unanswerable.

### L6 · The reliability gate — `src/qa/gate.ts` ⭐

**The heart of the project.** A retrieval system *always* returns something — even for
"What is the capital of France?", pgvector hands back the 5 least-dissimilar broker-doc
chunks. Blindly synthesizing from them yields a confident, fluent, **wrong** answer. In
a financial/trading context that's dangerous.

The fix: a **confidence gate** that runs *before* synthesis, using the similarity
**scores** as the signal. Two thresholds, both must clear:

- **top-1 floor** (`minTopSimilarity`, default 0.35) — is the single best chunk
  relevant at all? ("nothing is close")
- **mean floor** (`minMeanSimilarity`, default 0.28) — is the retrieved *set* coherent,
  or one lucky hit amid noise?

If either fails, **refuse** ("not found"). This is a direct port of a trading reflex:
*a wrong fill is worse than no fill; a wrong answer is worse than an honest "I don't
know."* `evaluateConfidence` is a **pure function** of `(scores, thresholds)`, so it's
exhaustively unit-tested and the threshold was **chosen from data**: calibration shows
positive top-sim ≈ 0.354 vs negative top-sim ≈ 0.313, and the 0.35 floor sits in that
gap.

### L7 · The LLM adapter — `src/llm/types.ts`

> **Concept: "grounded."**
> An answer is *grounded* when it's built **only** from the retrieved context, not from
> the model's free-floating memory, and the citations point at the exact chunks that
> support each claim — so a human can verify.

The `LLMProvider` interface gives the model two jobs:

- `synthesize(question, contexts)` → write a grounded answer.
- `judge(answer, contexts)` → score how well the answer is **supported** by the
  context (faithfulness, 0..1). This is the **LLM-as-judge** technique used in modern
  evals.

Two implementations ship behind this one interface (the **adapter pattern**):
`heuristic` (deterministic, the CI/eval default) and `ollama` (a local generative
model, free, with a per-call fallback to heuristic). A cloud provider would implement
the *same* interface — only the factory changes.

### L7 · The deterministic LLM — `src/llm/heuristic.ts`

Not a toy — a legitimate, auditable strategy:

- `synthesize()` is **extractive**: it picks the context sentences most relevant to the
  question (by token overlap) and stitches them together with inline `[n]` citation
  markers. `[n]` ties a sentence back to `contexts[n-1]`, and `answer.ts` builds the
  matching `citations[]` from the same hits — so `[1]` and `citations[0]` always agree.
- `judge()` scores **groundedness**: strip the `[n]` markers, and for each answer
  sentence find its best token-coverage against any context. Fully supported (≥0.6)
  counts 1, partially (≥0.3) counts ½, else 0. Average = groundedness.

Both are pure functions → eval scores are perfectly reproducible, which is the entire
point of the regression gate.

### L7 (primitives) · Text math — `src/text.ts`

Small, dependency-free, pure building blocks behind the heuristic synthesizer/judge:

- `tokenize` / `contentTokens` — turn prose into comparable word sets, dropping
  punctuation and **stopwords** (`the`, `is`, …) so common words don't dominate.
- `jaccard(A, B) = |A∩B| / |A∪B|` — **symmetric** set similarity: "how alike are two
  sets."
- `coverage(target, source) = |target∩source| / |target|` — **asymmetric** support:
  "how much of A is contained in B." This is the primitive behind groundedness (how
  much of an answer sentence is backed by context) and extractive relevance.

These are token-overlap heuristics — transparent and fast, but **blind to meaning**
(they can be fooled by shared words with reversed sense). That limitation is exactly
why the project *also* has embeddings (semantic) and why faithfulness is one metric
among several.

### L8 · Eval metrics — `evals/harness/metrics.ts`

> **Concept: you can't improve what you can't measure.** A RAG system has two things to
> measure, and they fail differently.

**Retrieval — did we fetch the right chunks?**
- **recall@k** — of the expected docs, what fraction appear in the top-k? ("did we even
  fetch it?"). Binary 0/1 with a single expected doc.
- **MRR (Mean Reciprocal Rank)** — how *highly* was the first relevant doc ranked?
  rank 1 → 1.0, rank 2 → 0.5, rank 3 → 0.33… ("did we rank it well?"). This is why
  recall@5 can be 1 while MRR is low — the right doc is in there, but ranked 5th.

**Generation — given the chunks, did we answer well?**
- **faithfulness** — is the answer supported by the context? (LLM-as-judge, L7).
- **refusal accuracy** — answer positives, refuse negatives? Over-refusing *and*
  under-refusing are both wrong.

`aggregate()` averages each metric over the **subset it applies to** — retrieval over
positives, faithfulness over *answered* positives, refusal over *all* cases. Mixing
those subsets up is a common eval bug.

### L8 · The runner — `evals/harness/runner.ts`

The crucial design choice: the runner reuses the **production** functions (`searchDocs`,
`answerQuestion`), not a parallel copy. So the eval measures the actual system an agent
hits — it can't drift from reality. Per case it gathers retrieval metrics, refusal
correctness, and (for answered positives) faithfulness judged against the *same*
contexts the answer was built from.

### L8/L9 · The regression gate — `evals/harness/gate.ts` ⭐

Metrics are useless if nobody enforces them. `evals/baseline.json` stores a threshold
per metric. After a run, `checkGate` compares the scorecard to the baseline and
**fails** (non-zero exit) if any metric dropped below `threshold − epsilon` — the tiny
epsilon distinguishes a real regression from floating-point noise. Wired into
`.github/workflows/ci.yml`, **a quality regression cannot merge.** To raise the bar,
improve something and then *raise* the baseline — the gate ratchets quality upward.

Current baseline: `recall@5 0.92 · MRR 0.80 · faithfulness 0.80 · refusal 0.90`.

### L10 · Boundaries — `src/config.ts`

The architecture rule that recurs everywhere: **validate untyped data at the edge, then
trust the inside.** Every environment variable runs through a **zod** schema with
defaults + ranges; a bad value throws a readable, fail-fast error. That's why there's
no `process.env.X!` scattered around and no `any` in the core. The behavior knobs live
here as validated numbers: `SEARCH_TOP_K` and the two refusal floors.

### The sandbox · `scripts/calibrate.ts`

The fastest way to see every layer at once with **no Docker and no keys**. It embeds
the corpus, cosine-ranks **in memory** with a 3-line `dot()`, runs the gate,
synthesizes + judges, and prints the same scorecard `pnpm eval` produces — plus
`MISS`/`LEAK` lines and the positive-vs-negative similarity gap that justifies the gate
threshold. Cosine ranking is identical whether vectors live in pgvector or in memory,
which is why this gives the same answer as the real system. **The best "break it"
sandbox in the repo.**

---

## Concept reference (the deep dives)

### Normalization (L2 normalization) — broken down

This one concept is what makes the whole search layer cheap, so it's worth unpacking.

**The vector before normalization.** An embedding is a list of numbers, e.g. a 3-D toy
vector `A = [3, 4, 0]`. It has a **direction** (which way it points in meaning space)
and a **magnitude / length** (how far from the origin):

```
|A| = √(3² + 4² + 0²) = √25 = 5
```

**L2 normalization = divide every component by the magnitude**, producing a vector that
points the *same way* but has length exactly 1 (a **unit vector**):

```
Â = A / |A| = [3/5, 4/5, 0] = [0.6, 0.8, 0]
|Â| = √(0.6² + 0.8² + 0²) = √(0.36 + 0.64) = √1 = 1
```

(The "L2" refers to the **L2 / Euclidean norm** — straight-line length, `√(Σ xᵢ²)`. An
"L1 norm" would instead be the sum of absolute values.)

**Why do it?** Recall cosine similarity:

```
cos(θ) = (A · B) / (|A| · |B|)
```

For meaning, only the **angle** (direction) matters, not how long the vectors are. If
you force every vector to length 1 *once* at embedding time, then `|A| = |B| = 1`, the
denominator becomes `1 × 1 = 1`, and it collapses to:

```
cos(θ) = A · B          (just the dot product — one multiply-and-sum, no square roots)
```

So normalization converts an expensive "compare by angle" into a cheap dot product
**everywhere downstream** — in pgvector, in the in-memory `calibrate.ts`, in the
heuristic judge. It also means similarity scores are directly comparable across chunks,
which is exactly what the refusal gate's thresholds rely on. In this repo it's a single
flag: `pipe(texts, { pooling: "mean", normalize: true })` in
[`src/embeddings/local.ts`](src/embeddings/local.ts).

> **Break it:** set `normalize: false`, re-run `pnpm calibrate`, and watch the
> similarity scores blow past the 0..1 range — the gate thresholds (tuned for unit
> vectors) stop meaning anything.

### Pooling — broken down

A transformer doesn't emit one vector per sentence; it emits one vector **per token**.
"Cancel a pending order" might be 5 tokens → 5 vectors. To get a single
sentence-embedding you must combine them. **Mean pooling** averages the token vectors
component-by-component into one vector of the same width (384). (Alternatives exist —
e.g. using the `[CLS]` token's vector — but mean pooling is the standard, robust choice
for MiniLM retrieval models.) Pooling happens *before* normalization: pool to one
vector, then scale it to length 1.

### Cosine similarity vs. cosine distance

Easy to confuse; they're complementary:

| Term | Formula | Range | "Closer" means |
|------|---------|-------|----------------|
| Cosine **similarity** | `A · B` (for unit vectors) | −1 … +1 | **higher** |
| Cosine **distance** | `1 − similarity` | 0 … 2 | **lower** |

Indexes (HNSW) sort by **distance** (smaller = nearer, so `ORDER BY embedding <=> q`
returns nearest first). Humans and the gate want **similarity**, so the query converts
back with `1 - (embedding <=> q)`. Same information, flipped.

### ANN & HNSW — broken down

- **Exact (brute-force) nearest neighbour:** compare the query to every stored vector.
  Always correct, but **O(N)** — fine for 64 chunks, painful for millions.
- **ANN (Approximate Nearest Neighbour):** accept *almost always correct* in exchange
  for being dramatically faster.
- **HNSW** is one ANN method: a layered graph. The top layer has a few nodes with
  long-range "express lane" links; lower layers add more nodes with shorter links. A
  search starts at the top, greedily hops toward the query, then drops a layer and
  refines — visiting a tiny fraction of all nodes.
- Knobs: `m` and `ef_construction` set graph quality at **build** time;
  `ef_search` trades recall for speed at **query** time. For this repo's tiny corpus
  it's effectively exact; the index earns its keep as the corpus grows.

### RAG, grounding, and hallucination

- **RAG (Retrieval-Augmented Generation):** instead of asking a model to answer from
  memory, first *retrieve* relevant documents, then ask it to answer *using those
  documents*. Retrieval supplies fresh, specific, citable facts.
- **Grounding:** constraining the answer to **only** the retrieved context, with
  citations back to the exact chunks.
- **Hallucination:** a confident answer not supported by any source. The two defenses
  here are the **refusal gate** (don't answer when retrieval is weak) and the
  **faithfulness judge** (score how well the answer is actually supported).

### Idempotency & content-addressed IDs

An operation is **idempotent** if running it twice has the same effect as running it
once. Here, a chunk's ID is a SHA-256 hash of its content (`source + docId + ord +
content`), like a git object. Re-ingesting an unchanged document produces the same IDs,
which collide on `ON CONFLICT (id) DO UPDATE` and overwrite in place — so re-running
`pnpm ingest` never duplicates rows. Change one character of content and the ID
changes, so the edit shows up as a new/updated chunk.

### Determinism (and why this project is obsessed with it)

A function is **deterministic** if the same input always yields the same output. The
local embedder, the chunker, the heuristic LLM, and every metric are all deterministic.
That matters because the **eval gate** must be reproducible: if scores drifted for
non-code reasons (a paid remote model changing under you, randomness in chunking), CI
would flap and "did retrieval get better?" would be unanswerable. Determinism is what
lets a dropped metric be attributed to *your change*.

---

## Try it yourself

```bash
pnpm install
pnpm calibrate          # the whole pipeline, in memory, no DB — start here

# full path with the real vector store:
cp .env.example .env
pnpm db:up && pnpm db:wait && pnpm migrate && pnpm ingest
pnpm eval               # print the scorecard
pnpm eval:gate          # the CI regression gate
pnpm dev                # run the MCP server over stdio
```

Good "break it" experiments to cement the concepts:

- Set `normalize: false` in `embeddings/local.ts` → similarity scores leave 0..1.
- Add `Date.now()` to `chunkId()` → the corpus duplicates on every ingest.
- Lower `ANSWER_MIN_TOP_SIMILARITY` toward 0 → negatives start leaking through the gate
  (watch `LEAK` lines in `pnpm calibrate`).
- Shrink `maxChars` in `chunk.ts` → watch recall@k / MRR move in `pnpm eval`.

---

*This roadmap documents the `LEARN ▼` layer in the source. When you change a concept in
the code, update the matching section here.*
