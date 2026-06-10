# L8 · The eval-loop: measuring a RAG system

> **You are here:** the centerpiece. We descend from "the system answers" into "the system
> is *measurably* good, and we can prove it didn't regress." This is the rung that turns a
> demo into engineering.
>
> **Code for this rung:** [`evals/`](../../evals/) — `dataset.jsonl`, `harness/metrics.ts`,
> `harness/runner.ts`, `harness/scorecard.ts`, `harness/gate.ts`, `baseline.json`, `run.ts`

---

## The concept

You cannot improve what you cannot measure. A RAG system has *two* things to measure, and
they fail differently:

1. **Retrieval** — did we fetch the right chunks?
2. **Generation** — given the chunks, did we answer faithfully (and refuse when we
   should)?

### A labeled dataset

Everything starts with **ground truth**: a list of cases, each a question plus the
*expected supporting document(s)*, and a **type**:
- **positive** — answerable from the corpus; the right doc should be retrieved and an
  answer given.
- **negative** — out-of-corpus; the system **must refuse**.

Without negatives, you can't measure refusal — so they're a deliberate, first-class part
of the set.

### The four metrics

| Metric | Layer it scores | Plain meaning |
|--------|-----------------|---------------|
| **recall@k** | retrieval | Of the expected docs, what fraction appear in the top-k results? "Did we even fetch it?" |
| **MRR** (Mean Reciprocal Rank) | retrieval | How *highly* was the first relevant doc ranked? Rank 1 → 1.0, rank 2 → 0.5, rank 3 → 0.33… "Did we rank it well?" |
| **faithfulness** | generation | Is the answer supported by the retrieved context? (LLM-as-judge, L7.) "Did we make things up?" |
| **refusal accuracy** | generation | Did we answer positives and refuse negatives? "Did we know when to stay quiet?" |

recall@k and MRR are classic information-retrieval metrics; faithfulness and refusal are
the LLM-era additions. Together they cover the whole pipeline.

### The regression gate

Metrics are useless if nobody enforces them. A **baseline** file stores a threshold per
metric. After each run, the **gate** compares the scorecard to the baseline and **fails
(non-zero exit) if any metric dropped** below threshold (minus a tiny epsilon for
floating-point jitter). Wire that into CI (L9) and a quality regression *cannot merge*.

This is "tick-data validation, zero mis-fires" applied to AI: the build is the safety net.

---

## In this codebase

### `evals/dataset.jsonl` — ground truth

~50 lines, one JSON object each: `{ id, question, expected_sources, type }`. The
`expected_sources` are `docId`s like `"zerodha/gtt"` (from L5). Eight are negatives
(`"What is the capital of France?"`, …). Open it — it's readable and it *is* the spec for
"good."

### `evals/harness/metrics.ts` — pure math

`recallAtK`, `reciprocalRank`, `refusalCorrect`, `mean`, and `aggregate`. All pure, all
unit-tested in [`test/metrics.test.ts`](../../test/metrics.test.ts) with worked examples
(rank-3 → 1/3, etc.). Read those tests — they're the definitions made executable.

### `evals/harness/runner.ts` — run the dataset

`runEval(deps, cases, k)` walks every case: retrieves top-k (→ recall, MRR from the same
ranking), calls `answerQuestion` (→ refusal), and for answered positives calls
`llm.judge` (→ faithfulness). It returns one `CaseResult` per case. Note it reuses the
*exact production functions* (`searchDocs`, `answerQuestion`) — the eval tests the real
system, not a parallel copy.

### `evals/harness/scorecard.ts` — report & remember

`aggregate()` → a `Scorecard`; `formatScorecard()` → the console table; `persistRun()`
writes `results/{timestamp}.json` and appends one line to `history.ndjson` — the
**score-over-time** trail so you can show the curve improving.

### `evals/harness/gate.ts` — the verdict

`checkGate(card, baseline)` returns `{ pass, failures[] }`; `formatGate()` prints it.
Driven by [`evals/baseline.json`](../../evals/baseline.json):
```
recall@5 ≥ 0.92 · MRR ≥ 0.80 · faithfulness ≥ 0.80 · refusal ≥ 0.90   (epsilon 0.02)
```
Tested in `test/gate.test.ts` (pass, regressed-metric-named, jitter-tolerated).

### `evals/run.ts` — the entry point

`pnpm eval` runs + prints + persists. `pnpm eval:gate` adds the gate and sets a non-zero
exit code on failure. It validates the dataset and baseline with zod first — bad data
fails loudly, not silently.

---

## Trace it yourself

```bash
pnpm calibrate     # no DB: full scorecard from the in-memory pipeline
# or, with Docker up and corpus ingested:
pnpm eval          # real pgvector path; writes evals/results/<timestamp>.json
pnpm eval:gate     # same, plus pass/fail verdict + exit code
```

Then open the newest file in `evals/results/` — it contains the scorecard *and every
per-case outcome* (what was retrieved, refused, grounded score). That's your debugging
microscope: sort by `recall === 0` to find retrieval misses, by `type === negative &&
!refused` to find leaks.

---

## Break it (this is the whole point)

1. **Cause a retrieval regression.** In `src/retrieval/search.ts`, change `k` handling to
   return only the *last* hit (e.g. `return result.slice(-1)`), or shuffle results. Run
   `pnpm calibrate` / `pnpm eval:gate`: recall@k and MRR crater, the gate **fails**, exit
   code 1. That red is what protects `main`. Revert.
2. **Cause a refusal regression.** Drop the gate thresholds (L6) and watch `refusal
   accuracy` fall below `0.90` → gate fails. Two different bugs, both caught by the same
   net.
3. **Move the goalposts honestly.** Improve something (e.g., better chunking), re-run, and
   if the new score is robust, *raise* the baseline. That's how the gate ratchets quality
   upward over time.

---

## Exercises

- recall@k answers "did we fetch it"; MRR answers "did we rank it well." Construct a case
  where recall@5 = 1 but MRR = 0.2, and explain why both metrics earn their place.
- Add one new positive case to `dataset.jsonl` for a fact in the corpus that isn't yet
  tested. Re-run `pnpm calibrate`. Did it pass? If not, is the bug in the corpus, the
  chunking, or your `expected_sources`? (This is the real authoring loop.)

---

## Go deeper (the next rung down)

Running the gate locally is good; running it automatically on every change is what makes
it *trustworthy*. Descend to **[L9 · The CI regression gate →](09-ci-regression-gate.md)**.
