# L5 · Chunking & ingestion

> **You are here:** the search layer assumed a table full of "chunks." We descend into
> where chunks come from — how a document is split, embedded, and written so the corpus
> is **reproducible and idempotent**.
>
> **Code for this rung:** [`src/ingest/`](../../src/ingest/) —
> `chunk.ts`, `load.ts`, `pipeline.ts`; corpus in [`corpus/`](../../corpus/)

---

## The concept

### Why chunk at all?

You don't embed a whole 5-page document as one vector. Two reasons:

1. **Retrieval precision.** A single vector for a long doc blurs many topics into one
   averaged point. Smaller chunks each capture one idea, so the right *passage* can rank
   highly for a specific question.
2. **Grounding precision.** The answer cites the chunk it used. Smaller chunks = tighter,
   checkable citations (L7), and less irrelevant text fed to the synthesizer.

But chunks can't be *too* small either, or they lose the context needed to be meaningful.
Chunking is a precision/context tradeoff, and the unit of that tradeoff is **size +
boundaries**.

### Good boundaries: structure-aware splitting

Naively cutting every N characters slices sentences and headings in half. Better: split on
**document structure** (headings) first, then only break *oversized* sections into
windows — and give adjacent windows a small **overlap** so a fact straddling a boundary
still appears whole in at least one chunk.

### Determinism & idempotency

This is the reliability theme again, applied to data:

- **Deterministic chunking** — same input always yields the same chunks. That's what makes
  retrieval evals reproducible run to run.
- **Deterministic ids** — each chunk's primary key is a *hash of its content* (+ source +
  position). So re-ingesting unchanged docs produces the *same ids*, and the
  `ON CONFLICT (id)` upsert (L4) is a no-op. You can run `pnpm ingest` a hundred times and
  the corpus is identical. No duplicates, no drift.

---

## In this codebase

### Chunking: `src/ingest/chunk.ts` (pure, testable)

`chunkMarkdown(markdown, options)` does exactly the concept above:
- `splitSections()` breaks the doc on ATX headings (`#`..`######`), tagging each section
  with its heading as a `title`.
- `windowBody()` only splits a section if it exceeds `maxChars`, preferring paragraph
  boundaries, and carries an `overlap` tail into the next window.
- Defaults: `maxChars: 1200`, `overlap: 150` (`DEFAULT_CHUNK_OPTIONS`).

It's a **pure function** — no IO, no globals — which is why
[`test/chunk.test.ts`](../../test/chunk.test.ts) can assert section titles, determinism
(`chunkMarkdown(md) === chunkMarkdown(md)`), and the size bound directly.

### Loading: `src/ingest/load.ts`

- `loadCorpusDir(dir)` walks `corpus/` for `*.md`, parses a tiny **frontmatter** block
  (`source`, `title`, `url`) with `parseFrontmatter()` — no YAML dependency, just flat
  keys — and derives a `docId` from the file path (e.g. `zerodha/gtt`). That `docId` is
  what the eval's `expected_sources` match against (L8).
- `documentFromText()` and `documentFromUrl()` build the same `SourceDocument` shape from
  an inline string or a fetched URL (the latter crudely strips HTML). These back the
  `ingest_doc` MCP tool.

### The pipeline: `src/ingest/pipeline.ts`

`ingestDocuments(sql, embedder, docs)` is the chunk → embed → upsert assembly line:
1. `chunkMarkdown(doc.markdown)` → raw chunks.
2. embed them **in batches** (`EMBED_BATCH = 32`) to bound memory.
3. build `ChunkInput`s, each keyed by
   `chunkId(source, docId, ord, content)` — a SHA-256 slice (see `chunkId`).
4. `upsertChunks(sql, inputs)` (L4).

`chunkId` is the deterministic-id mechanism. Read it and connect it back to `ON CONFLICT
(id)`: *content defines identity*.

### The corpus itself: `corpus/`

Real, curated broker-API docs (Zerodha Kite Connect + Finvasia Shoonya) as markdown with
frontmatter. It's **vendored** (committed) on purpose: the eval set must score against a
fixed, offline corpus, or "did retrieval get better?" becomes unanswerable.

---

## Trace it yourself

- **See chunk boundaries** without any DB:
  ```bash
  pnpm exec tsx -e "import {readFileSync} from 'node:fs'; import {parseFrontmatter} from './src/ingest/load.ts'; import {chunkMarkdown} from './src/ingest/chunk.ts'; const {body}=parseFrontmatter(readFileSync('corpus/zerodha/gtt.md','utf8')); for (const c of chunkMarkdown(body)) console.log('—', c.title, '·', c.content.length, 'chars');"
  ```
  (If your shell dislikes the one-liner, paste it into a scratch `.ts` and `pnpm exec tsx`
  it.) You'll see one chunk per heading, each under the size bound.
- **See idempotency:** with Docker up, run `pnpm ingest` twice. The second run reports the
  same chunk count and changes nothing — the deterministic ids collided on `ON CONFLICT`.
- **The determinism test:** read the "is deterministic" case in `test/chunk.test.ts`.

---

## Break it

1. **Make ids non-deterministic.** In `pipeline.ts`, add `Date.now()` to the `chunkId`
   input. Re-ingest twice (Docker) — now every run *duplicates* the corpus, because ids no
   longer collide. Watch `countChunks` balloon. Revert. You just felt why content-addressed
   ids matter.
2. **Shrink `maxChars` to 200.** Re-run `pnpm calibrate`. More, smaller chunks change
   recall and MRR (L8) — sometimes up (precision), sometimes down (lost context). Tuning
   chunk size *is* a retrieval-quality lever; now you can measure it.

---

## Exercises

- Why hash `content` into the id rather than using an auto-increment integer? Tie your
  answer to re-ingestion and to git-style content addressing.
- The chunker keeps the heading as each chunk's `title`. Where does that title resurface
  for the *user*? (Trace `title` from `ChunkInput` → `SearchHit` → citations in L7.)

---

## Go deeper (the next rung down)

You now have a searchable, reproducible corpus and a pipeline that answers. Time for the
part that makes this system *trustworthy*: how it decides **not** to answer. Descend to
**[L6 · The reliability gate →](06-the-reliability-gate.md)**.
