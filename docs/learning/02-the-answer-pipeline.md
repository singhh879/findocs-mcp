# L2 · The answer pipeline: retrieve → gate → synthesize → cite

> **You are here:** a `tools/call` for `answer_question` just arrived. We descend from
> "a call landed" into "the orchestration that turns a question into a grounded,
> cited answer — or an honest refusal."
>
> **Code for this rung:** [`src/qa/answer.ts`](../../src/qa/answer.ts),
> [`src/services.ts`](../../src/services.ts)

---

## The concept

This is the heart of **RAG (Retrieval-Augmented Generation)**, but notice it's mostly
*plumbing and policy*, not magic. A grounded-QA request is a fixed sequence:

```
question
  │
  ├─▶ 1. RETRIEVE   embed the question, find the top-k most similar chunks   (L3, L4)
  │
  ├─▶ 2. GATE       is retrieval confident enough to answer at all?          (L6)
  │        └─ no ──▶ REFUSE ("not found")  ◀── the reliability core
  │
  ├─▶ 3. SYNTHESIZE write an answer using ONLY those chunks                   (L7)
  │
  └─▶ 4. CITE       attach which chunks support the answer
```

The order matters and the **gate sits before synthesis**: we decide whether we're allowed
to answer *before* we write anything. A RAG system that always answers will always
hallucinate on out-of-scope questions. This one can say no.

### Dependency injection (DI), and why

`answerQuestion` doesn't reach out and grab a database or a model. It receives a `deps`
object: `{ sql, embedder, llm }`. This is **dependency injection**. The payoff:

- **Testable:** a test can pass a fake `llm` or `embedder` and assert behavior with no
  network, no Docker, no model download.
- **Swappable:** local vs cloud embedder, heuristic vs Ollama LLM — chosen once, at the
  edge, never threaded through the logic.
- **Honest boundaries:** the function's signature tells you *exactly* what it touches.

---

## In this codebase

### The wiring: `src/services.ts`

```ts
export function createServices(): Services {
  return { sql: getSql(), embedder: getEmbedder(), llm: getLLMProvider() };
}
```

`Services` is the dependency bundle shared by the MCP server, the CLI, and the eval
runner. Each `get*()` is a **factory** that reads config and returns the configured
implementation (you'll meet them in L3/L7). They're memoized and lazy — calling
`createServices()` does *not* connect to Postgres or load MiniLM; that happens on first
real use.

### The orchestrator: `src/qa/answer.ts`

Read `answerQuestion(deps, question, options)` top to bottom — it *is* the diagram above:

1. **Retrieve:** `const hits = await searchDocs(deps, question, k)` (→ L4).
2. **Gate:** `const gate = evaluateConfidence(hits.map(h => h.score), thresholds)` (→ L6).
   If `!gate.pass`, return immediately with `refused: true`, the `NOT_FOUND_MESSAGE`, and
   **empty citations** (we don't imply support we don't have).
3. **Synthesize:** build `contexts` from the hits and call
   `deps.llm.synthesize(question, contexts)` (→ L7).
4. **Cite:** map the hits to `citations` (id, source, title, url, score).

The function returns a typed `AnswerResult`: `{ answer, refused, reason, citations,
confidence }`. **Refusal is a normal return value, not an exception.** That's a deliberate
design choice — refusing is correct behavior, so it's a first-class outcome the eval
harness can score.

Also notice the thresholds and `k` come from `loadConfig()` but can be **overridden** via
`options` — the eval runner uses that to test the exact same code path with controlled
settings.

---

## Trace it yourself

The cleanest trace needs no DB. Open [`scripts/calibrate.ts`](../../scripts/calibrate.ts):
it reproduces this pipeline in-memory (embed corpus → cosine rank → gate → synthesize →
judge) so you can watch every stage. Run:

```bash
pnpm calibrate
```

Then read the loop in `calibrate.ts` next to `answerQuestion` in `answer.ts` — they're
the same four steps. The script even prints `MISS`/`LEAK` lines when retrieval or refusal
does the wrong thing, which is the pipeline's behavior made visible.

For the real DB path, the same function runs inside the MCP `answer_question` handler
(L0) and inside [`evals/harness/runner.ts`](../../evals/harness/runner.ts) (L8).

---

## Break it

1. **Disable the gate.** In `answer.ts`, temporarily force `gate.pass = true` (or set the
   thresholds to `0`). Run `pnpm calibrate`. Watch **refusal accuracy** fall and `LEAK`
   lines appear for the negative cases — the system now answers "What is the capital of
   France?" using broker docs. This is exactly the failure the gate prevents. Revert.
2. **Reorder the steps.** Move synthesis before the gate. Notice you can no longer return
   a clean refusal without having already done useless work — order is part of the design.

---

## Exercises

- Write the type of `answerQuestion` from memory, then check it. Why does it return
  `confidence` even on success? (Hint: observability — see what the gate saw.)
- `searchDocs` and `answerQuestion` both call retrieval. In the runner we call them
  separately. Find where, and explain the tradeoff (a second search vs. threading hits
  through). Could you refactor to retrieve once? What would you give up?

---

## Go deeper (the next rung down)

Step 1 said "embed the question." But *what is embedding text into a vector*, and why can
you compare two such vectors? Descend to **[L3 · Embeddings →](03-embeddings.md)**.
