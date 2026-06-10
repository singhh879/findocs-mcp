# L7 · Grounded synthesis & citations (and the judge)

> **You are here:** the gate passed. Now we descend into how the answer gets *written*
> from the retrieved chunks, how it's *cited*, and how a second model *judges* whether
> the answer is actually supported — the **LLM-as-judge** idea.
>
> **Code for this rung:** [`src/llm/`](../../src/llm/) —
> `types.ts`, `heuristic.ts`, `ollama.ts`, `index.ts`

---

## The concept

### Grounded synthesis

"Grounded" means the answer is built **only from the retrieved context**, not from the
model's free-floating memory. This is what keeps RAG honest: the citations point at the
exact chunks that support each claim, so a human can verify.

There are two ways to produce a grounded answer, and this project ships both behind one
interface:

- **Extractive (deterministic).** Pick the most relevant *sentences from the context* and
  stitch them together with citation markers. No model, no cost, perfectly reproducible.
  This is the default — and it's a legitimate, auditable strategy, not a toy.
- **Generative (LLM).** Hand the context + question to a language model and ask it to
  write a fluent grounded answer. More natural prose, but needs a model. Here that's a
  **local Ollama** model (free), so the project stays zero-cost.

### LLM-as-judge (faithfulness)

How do you *measure* whether an answer is grounded? You can't string-match it against a
gold answer (many correct phrasings exist). The modern technique is **LLM-as-judge**: give
a model the answer + the source context and ask "is this answer supported by this
context?" — a 0..1 **faithfulness/groundedness** score.

The catch for CI: a judge that calls a paid API makes your gate non-reproducible and
costly. So here the judge is also pluggable, with a **deterministic fallback** that scores
groundedness by measuring how much of the answer's content is *covered* by the context
tokens. Same role, zero cost, stable in CI.

### The adapter pattern

`search`, the gate, and the runner all depend on an **interface**, not a vendor. Swapping
heuristic ↔ Ollama ↔ (future) Anthropic/OpenAI is a one-line config change with no edits
to the pipeline. That's the **adapter pattern**, and it's why "zero-cost default,
upgradeable later" was achievable without a rewrite.

---

## In this codebase

### The contract: `src/llm/types.ts`

```ts
export interface LLMProvider {
  readonly id: string;
  synthesize(question: string, contexts: RetrievedContext[]): Promise<string>;
  judge(answer: string, contexts: RetrievedContext[]): Promise<JudgeResult>; // {grounded, rationale}
}
```

Two responsibilities: **write** an answer, and **judge** an answer. Both take the same
`contexts` so grounding and judging share a frame of reference.

### Default: `src/llm/heuristic.ts` (deterministic)

- `synthesize()` — splits each context into sentences, scores every sentence by
  **token overlap** with the question (`coverage()` from [`src/text.ts`](../../src/text.ts)),
  picks the top few, and appends `[n]` citation markers tying each sentence to its context.
  Deterministic tie-breaking keeps output stable.
- `judgeGroundedness()` — for each answer sentence, finds the best token-coverage against
  any context; averages into a 0..1 score (full support ≥0.6, partial ≥0.3). Exported
  separately so it can also serve as the **eval-time fallback judge**.

Read [`test/heuristic.test.ts`](../../test/heuristic.test.ts): it proves the synthesizer
extracts the right sentence and cites it, that it's deterministic, and that the judge
scores a supported answer high and an off-topic answer low.

### Upgrade: `src/llm/ollama.ts` (generative, free)

`OllamaProvider` POSTs to a local Ollama server for both synthesis and judging, with a
**per-call fallback**: any error or unparseable response falls back to the heuristic
provider. So enabling Ollama can only *improve* quality, never break the pipeline — a
nice example of defensive adapter design.

### The factory: `src/llm/index.ts`

`getLLMProvider()` reads `LLM_PROVIDER` (`heuristic` | `ollama`) with the same
exhaustive-switch guard you saw for embeddings.

---

## Trace it yourself

- **Watch synthesis + judging in one shot:** `pnpm calibrate`. For every answered
  positive it synthesizes an answer and runs `judge()`; the aggregate **faithfulness**
  number it prints is the mean of those groundedness scores.
- **Read a citation end to end:** in `answer.ts`, `citations` are built from the same
  `hits` passed as `contexts` to `synthesize`. So the `[1]` in an answer and
  `citations[0]` refer to the same chunk. Follow `title`/`source` back to L5.

---

## Break it

1. **Hand the judge an ungrounded answer.** In a scratch run, call `judgeGroundedness("The
   Eiffel Tower is in Paris.", contexts)` with broker-doc contexts — score near 0. Then
   judge a sentence copied *from* a context — score near 1. You've validated the metric
   that powers faithfulness.
2. **Switch to Ollama (optional).** Install Ollama, `ollama pull llama3.2`, set
   `LLM_PROVIDER=ollama`, and run `pnpm calibrate`/`pnpm eval`. Answers become more fluent;
   faithfulness is now scored by a real model. Turn it off and the deterministic path
   returns — same interface, different `id` in the scorecard.

---

## Exercises

- The heuristic judge uses token coverage. List two ways it can be fooled (e.g., an answer
  that copies words but reverses meaning). Why is an LLM judge better — and why might *it*
  still be wrong? (This is why faithfulness is one metric among several, not the only one.)
- Sketch the `AnthropicProvider` you'd add: which two methods, what it returns, and what
  changes elsewhere in the codebase. (Answer: only the factory.)

---

## Go deeper (the next rung down)

You've seen every component answer one question. But *how good is the whole system, as a
number you can defend* — and how do you stop it from silently getting worse? Descend to
**[L8 · The eval-loop →](08-the-eval-loop.md)**.
