# L3 · Embeddings: turning text into vectors

> **You are here:** the pipeline said "embed the question." We descend into what that
> actually means — how a sentence becomes 384 numbers that capture *meaning*.
>
> **Code for this rung:** [`src/embeddings/`](../../src/embeddings/) —
> `types.ts`, `local.ts`, `index.ts`

---

## The concept

An **embedding** is a fixed-length list of numbers (a *vector*) that represents a piece of
text's *meaning*, learned by a neural network. The defining property:

> **Texts with similar meaning get vectors that point in similar directions.**

So "How do I cancel an order?" and "Which endpoint deletes a pending order?" land close
together, even though they share almost no words. That's the leap beyond keyword search:
embeddings capture *semantics*, not just *tokens*.

A few things to internalize:

- **Dimensionality.** Our model (`all-MiniLM-L6-v2`) outputs **384 numbers** per text.
  Each dimension is a learned latent feature — not human-interpretable individually, but
  collectively they place the text in a 384-dimensional "meaning space."
- **The model is frozen.** We don't train anything. We *use* a pre-trained sentence
  encoder. Embedding is a deterministic forward pass: same text → same vector.
- **Normalization.** We ask the model for **L2-normalized** vectors (length 1). This is a
  deliberate setup for the next layer: when vectors are unit length, their **dot product
  equals their cosine similarity** (see the [appendix](90-appendix-cosine-from-scratch.md)).
  Normalizing here makes "compare by angle" cheap and consistent everywhere downstream.
- **Pooling.** A sentence is many tokens, each with its own vector. **Mean pooling**
  averages them into one sentence vector. (Different models use different pooling; MiniLM
  + mean pooling is a strong, standard default.)

### Why *local* embeddings here?

The default runs entirely in-process via `@xenova/transformers` (transformers.js): no API
key, no per-call cost, fully deterministic. That last word is the point — **reproducible
evals**. If the embedder were a paid remote call that could change under you, your CI
gate would wobble for reasons unrelated to your code.

---

## In this codebase

### The contract: `src/embeddings/types.ts`

```ts
export interface Embedder {
  readonly dim: number;
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
}
```

Tiny on purpose. This minimal surface is *why* the provider is swappable: anything that
can turn strings into equal-length number arrays is an `Embedder`. The `dim` must match
the database's `vector(384)` column (L4), and `id` gets recorded in eval artifacts so a
score is always attributable to a model.

### The implementation: `src/embeddings/local.ts`

`LocalEmbedder` lazy-loads the transformers.js pipeline on first use and caches it. The
core call:

```ts
const output = await pipe(texts, { pooling: "mean", normalize: true });
return output.tolist() as number[][];
```

`pooling: "mean"` and `normalize: true` are the two decisions from the concept section,
made concrete. It also asserts the output count matches the input count — a cheap
invariant that catches batching bugs early.

### The factory: `src/embeddings/index.ts`

`getEmbedder()` reads `EMBEDDINGS_PROVIDER` from config and returns the right
implementation. Today only `local`, but the `switch` has an **exhaustiveness guard**
(`const _exhaustive: never = ...`) so the day you add `openai`, the compiler *forces* you
to handle it. (More on this pattern in L10.)

---

## Trace it yourself

The embedder is exercised end-to-end by `calibrate`, which embeds the whole corpus and
every eval question and prints the resulting similarity statistics:

```bash
pnpm calibrate        # prints positive vs negative top-similarity stats
```

Look at the tail of the output:
```
positive top-sim:  min=0.354 p50=0.544 max=0.793
negative top-sim:  min=0.105 p50=0.202 max=0.313
```

Those numbers are cosine similarities (L4) between question embeddings and the best chunk
embedding. In-corpus questions sit high; out-of-corpus questions sit low. **That gap is
what makes the whole system work** — and it exists purely because the embedder put
similar meanings near each other.

---

## Break it

1. **Feed it nonsense vs. signal.** Add two lines to a scratch run: embed
   `"place a bracket order"` and `"bracket order placement"` and `"photosynthesis in
   ferns"`. Compute dot products (they're unit vectors, so dot == cosine). The two order
   phrasings will score high together; the botany one won't. You've just demonstrated
   semantic similarity with your own hands.
2. **Remove normalization.** In `local.ts`, set `normalize: false`. Re-run `pnpm
   calibrate`. Scores change scale and the gate thresholds no longer mean what they did —
   because dot product is no longer cosine. Revert. (This is the tightest possible link
   between L3 and L4.)

---

## Exercises

- Why must `Embedder.dim` equal the DB column width? Trace what would happen on insert if
  a 768-dim model's output hit a `vector(384)` column. (Answer lives in L4.)
- The interface returns `number[][]` for a *batch*. Why batch at all? Look at
  `EMBED_BATCH` in [`src/ingest/pipeline.ts`](../../src/ingest/pipeline.ts) and reason
  about memory vs. throughput.

---

## Go deeper (the next rung down)

You can now turn text into comparable vectors. But *how* do we find the nearest vectors
among tens of thousands, fast — and what does "nearest" even mean numerically? Descend to
**[L4 · Vector search: cosine, pgvector, HNSW →](04-vector-search-cosine-pgvector-hnsw.md)**.

**Foundational references (optional):** "Sentence-BERT" (the idea behind sentence
embeddings), and the MiniLM model card. You don't need them to proceed.
