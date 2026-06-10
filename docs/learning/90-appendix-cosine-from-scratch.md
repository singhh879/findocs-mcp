# ⊥ Appendix · Cosine similarity from scratch

> **You are here:** the floor. No app, no framework — just the arithmetic that makes
> "semantic similarity" a number. If L4 felt like hand-waving ("dot product equals
> cosine"), this rung removes the hands.

---

## Vectors are arrows

A vector is an ordered list of numbers, e.g. `A = [3, 4]`. Geometrically it's an arrow
from the origin to the point `(3, 4)`. Our embeddings (L3) are the same idea with **384**
numbers instead of 2 — an arrow in 384-dimensional space. You can't picture 384-D, but
every formula below works identically regardless of dimension.

## Three operations

### 1. Dot product (a single number)

Multiply matching components, sum them:

```
A · B = Σ aᵢ·bᵢ
A = [3, 4],  B = [4, 3]
A · B = 3·4 + 4·3 = 12 + 12 = 24
```

In code, that's the whole thing (see `dot()` in
[`scripts/calibrate.ts`](../../scripts/calibrate.ts) and `coverage`/scoring helpers):

```ts
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
```

### 2. Magnitude (length of the arrow)

Pythagoras, in N dimensions:

```
|A| = √(Σ aᵢ²)
|A| = √(3² + 4²) = √25 = 5
|B| = √(4² + 3²) = √25 = 5
```

### 3. Cosine similarity (the angle between two arrows)

```
cos(θ) = (A · B) / (|A| · |B|)
       = 24 / (5 · 5)
       = 24 / 25
       = 0.96
```

So `A` and `B` point *almost* the same way (cos ≈ 0.96, angle ≈ 16°). Makes sense: `[3,4]`
and `[4,3]` are near-mirror arrows of equal length.

### The range, and what it means

| cos(θ) | angle | meaning |
|--------|-------|---------|
| **+1** | 0° | same direction (most similar) |
| **0** | 90° | orthogonal (unrelated) |
| **−1** | 180° | opposite (most dissimilar) |

For text embeddings you mostly see values in `[0, 0.8]`; that's why the gate's `0.35`
threshold (L6) is meaningful — it's a point on this scale.

---

## The shortcut the whole system relies on

The embedder (L3) returns **unit vectors**: `|A| = |B| = 1`. Substitute into the cosine
formula:

```
cos(θ) = (A · B) / (1 · 1) = A · B
```

**For normalized vectors, cosine similarity *is* the dot product.** No division, no square
roots at query time. That's why:

- `calibrate.ts` ranks by a bare `dot()`.
- pgvector's cosine operator `<=>` is cheap, and `1 - (embedding <=> q)` recovers the
  similarity (L4).

It also means a normalized dot product can't exceed 1 — a handy invariant.

### Cosine distance vs. similarity (don't trip on this)

Vector indexes sort by *distance* (smaller = closer). **Cosine distance = 1 − cosine
similarity**:

```
identical:   similarity 1  → distance 0
orthogonal:  similarity 0  → distance 1
opposite:    similarity −1 → distance 2
```

That's the exact conversion in `vectorSearch`: `ORDER BY embedding <=> q` (ascending
distance) and `SELECT 1 - (embedding <=> q) AS score` (back to similarity for humans).

---

## Do it yourself (5 minutes)

1. **By hand:** compute `cos(θ)` for `A = [1, 0]` and `B = [0, 1]`. (Answer: dot = 0,
   magnitudes 1 → cosine 0 → orthogonal → 90°. Two unrelated "meanings.")
2. **In the REPL:**
   ```bash
   pnpm exec tsx -e "const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0); console.log(dot([3,4],[4,3]));"
   ```
   Prints `24`. Now divide by `5*5` in your head → `0.96`. You just reproduced the
   similarity engine.
3. **Real vectors:** the `pnpm calibrate` output's `positive top-sim` / `negative top-sim`
   numbers are these exact dot products between a question's 384-D unit vector and the best
   chunk's. Everything you built in L4–L8 rests on this one operation.

---

## Why this is enough

Nearest-neighbour search, the HNSW graph, the refusal threshold, recall@k — all of it is
ultimately "whose arrow points most like mine?", measured by a dot product of normalized
vectors. You've now seen the system from the agent's tool call (L0) down to the
multiplication-and-addition at the very bottom (⊥). That's the full reverse trace.

---

**Back to the top:** [LEARNING.md](../../LEARNING.md) · or revisit any rung from the map.
