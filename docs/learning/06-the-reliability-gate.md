# L6 · The reliability gate: confidence & refusal

> **You are here:** the conceptual heart of the project. We descend into the few lines
> that decide whether the system is *allowed to answer* — the "zero mis-fires" instinct
> applied to RAG.
>
> **Code for this rung:** [`src/qa/gate.ts`](../../src/qa/gate.ts) (and its use in
> [`src/qa/answer.ts`](../../src/qa/answer.ts))

---

## The concept

A retrieval system *always returns something* — even for "What is the capital of France?",
pgvector dutifully hands back the 5 least-dissimilar broker-doc chunks. If you blindly
synthesize from them, you get a confident, fluent, **wrong** answer. That's a
hallucination, and in a financial/trading context it's dangerous.

The fix is a **confidence gate**: before answering, check whether retrieval is actually
*confident*, using the **similarity scores** as the signal. If the best match is weak, or
the retrieved set is weak on average, **refuse** — return "not found" instead of guessing.

This is a direct port of a trading-infra reflex: *a wrong fill is worse than no fill.* A
wrong answer is worse than an honest "I don't know."

### Why two thresholds?

- **Top-1 floor** (`minTopSimilarity`): is the single best chunk relevant at all? Catches
  "nothing here is close."
- **Mean floor** (`minMeanSimilarity`): is the *retrieved set* coherent, or did we scrape
  together a few mediocre matches? Catches "one lucky hit surrounded by noise."

Both must clear for the system to answer. They're tunable knobs, and L8 *measures* how
well they're set.

### The honesty of measurable refusal

Crucially, refusal is **scored**. The eval set (L8) contains out-of-corpus *negative*
cases that are *supposed* to be refused, and in-corpus *positive* cases that are supposed
to be answered. "Refusal accuracy" treats over-refusing and under-refusing as equally
wrong. So the gate can't cheat by refusing everything.

---

## In this codebase

### `src/qa/gate.ts` — `evaluateConfidence(scores, thresholds)`

A **pure function**. Inputs: the list of similarity scores from retrieval and the two
floors. Output: a `GateDecision { pass, topSimilarity, meanSimilarity, reason }`.

The logic, in plain English:
1. No scores at all → refuse (`"no results retrieved"`).
2. `max(scores) < minTopSimilarity` → refuse with a reason naming the top similarity.
3. `mean(scores) < minMeanSimilarity` → refuse with a reason naming the mean.
4. Otherwise → pass.

It returns the numbers it judged on (`topSimilarity`, `meanSimilarity`) so callers can
*observe* the decision — that's why `AnswerResult.confidence` exists even on success.

### Where it's wired: `src/qa/answer.ts`

The gate is called **before** synthesis. On `!pass`, `answerQuestion` returns immediately
with `refused: true`, the standardized `NOT_FOUND_MESSAGE`, and **empty citations**. No
LLM call happens. Refusal is cheap and early — exactly the right place for a safety check.

### The thresholds come from config

`ANSWER_MIN_TOP_SIMILARITY` (default `0.35`) and `ANSWER_MIN_MEAN_SIMILARITY` (default
`0.28`) live in [`src/config.ts`](../../src/config.ts), validated by zod. They were
**calibrated**, not guessed (see below).

---

## Trace it yourself

- **The unit test is a spec of the policy:** read the `evaluateConfidence` cases in
  [`test/gate.test.ts`](../../test/gate.test.ts) — no results, top-below-floor,
  mean-below-floor, and pass. Each is one branch of the gate.
- **See the margin that justifies the thresholds:** `pnpm calibrate` prints
  ```
  positive top-sim:  min=0.354 ...
  negative top-sim:  ... max=0.313
  ```
  The default top floor `0.35` sits in the **gap** between in-corpus and out-of-corpus
  questions. That's not luck — the threshold was *chosen* by looking at these
  distributions. This is calibration: set the knob from data, then let the eval gate
  defend it.

---

## Break it

1. **Lower the top floor to 0.05.** Edit `.env` (`ANSWER_MIN_TOP_SIMILARITY=0.05`) and run
   `pnpm calibrate`. Negatives now slip through — you'll see `LEAK` lines and **refusal
   accuracy** drops below the baseline. The CI gate (L9) would go red. Revert.
2. **Raise it to 0.6.** Now legitimate questions get refused — **answer rate** falls and a
   positive shows up as a refusal-incorrect case. Over-caution is also a failure. The two
   experiments together show why the threshold lives in a *band*, and why you need the
   eval set to find it.

---

## Exercises

- The gate uses only similarity scores. Name one *other* signal you could add (e.g., a
  margin between top-1 and top-2, or an answerability classifier) and how you'd test
  whether it helps — using L8's metrics, not vibes.
- Why return empty citations on refusal instead of the weak chunks? Argue it from the
  user's trust, not just code tidiness.

---

## Go deeper (the next rung down)

When the gate *does* pass, something has to actually write the answer and prove it's
grounded. Descend to **[L7 · Grounded synthesis & citations →](07-grounded-synthesis-and-citations.md)**.
