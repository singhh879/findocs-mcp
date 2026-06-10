# L10 · TypeScript & architecture: the substrate

> **You are here:** the engineering bedrock. Every layer above leaned on a few patterns —
> strict types, ESM, dependency injection, factories, adapters, pure functions. We descend
> into *why those choices*, so you can reproduce them, not just recognize them.
>
> **Code for this rung:** [`tsconfig.json`](../../tsconfig.json), the `index.ts` factories,
> [`src/config.ts`](../../src/config.ts), the `test/` suite

---

## The concept

### Strict TypeScript = compile-time reliability

This project's reliability theme isn't only runtime (the gate); it's also **compile-time**.
A strict compiler catches whole classes of bugs before code runs. Look at
`tsconfig.json` — beyond `"strict": true`, it enables:

- **`noUncheckedIndexedAccess`** — `arr[i]` is typed `T | undefined`. You're *forced* to
  handle "what if it's not there?" This is why you see `?? []`, `if (!vec) throw`, etc. In
  a system about not-mis-firing, "I assumed the array had an element" is exactly the bug
  you want the compiler to block.
- **`exactOptionalPropertyTypes`** — `x?: string` means "absent or string," **not** "string
  or undefined." It made the zod boundaries in `evals/run.ts` and `ingest/load.ts` explicit
  (we either omit a field or give it a value). Subtle, but it stops a category of
  "undefined leaked into an optional" confusion.
- **`verbatimModuleSyntax` + ESM** — `import type` vs `import`, `.js` specifiers in TS
  source. Honest module boundaries that match how Node actually loads ESM.
- **`noImplicitReturns`, `noFallthroughCasesInSwitch`** — no accidental `undefined` returns,
  no fallthrough bugs.

The rule the project follows: **no `any` in core paths.** Every external input (env, JSON,
DB rows) is parsed/typed at the boundary, so the interior is fully typed.

### Boundaries: parse, don't trust

`src/config.ts` runs `process.env` through a **zod** schema with defaults and ranges, and
*throws a readable error* on bad config (fail fast). The eval runner does the same for
`dataset.jsonl` and `baseline.json`. The pattern: **validate at the edge, trust the
inside.** Untyped data never travels inward.

### Dependency injection + factories + adapters

You met all three; here they are named:

- **Adapter** — a small interface (`Embedder`, `LLMProvider`) that hides a vendor. Lets you
  swap implementations without touching callers.
- **Factory** — `getEmbedder()`, `getLLMProvider()`, `getSql()`: read config, construct the
  right adapter, memoize it. One place where "which implementation" is decided.
- **Dependency injection** — pass the constructed adapters (`{ sql, embedder, llm }`) into
  logic (`answerQuestion`, `runEval`) instead of importing them inside. Makes the logic
  pure-ish and testable.

The **exhaustive `switch`** in those factories (`const _exhaustive: never = x`) is a
favorite trick: add a new enum member and the compiler errors until you handle it. Types
enforcing completeness.

### Pure functions where it matters

The trickiest logic — chunking, metrics, the gate, the heuristic judge — is written as
**pure functions** (output depends only on input, no IO). That's why `test/` can cover them
exhaustively with tiny, fast, deterministic unit tests. Side effects (DB, model, network)
are pushed to the edges (`db/`, `embeddings/local.ts`, `llm/ollama.ts`).

---

## In this codebase

- **Read `tsconfig.json`** and find one line for each strict flag above. Then grep the code
  for the *consequences*: `?? ""`, `if (!x) throw`, `import type`.
- **Read `src/config.ts`** as the canonical "parse the boundary" example.
- **Map the test pyramid:** open `test/`. Notice almost every file targets a **pure**
  module (chunk, metrics, gate, text, heuristic, config); only `repo.integration.test.ts`
  touches IO, and it's *gated* on `DATABASE_URL`. Fast unit tests by default, slow
  integration only when wired. That shape is intentional.

---

## Trace it yourself

```bash
pnpm typecheck     # the compiler enforcing all of the above; should be silent
pnpm test          # the pure-function safety net; ~36 fast tests
```

Then read one pure module + its test side by side — e.g. `src/qa/gate.ts` and
`test/gate.test.ts`. The test *is* the spec; the pure function *is* the implementation; the
strict compiler guarantees the types line up. That triangle is the project's quality model
in miniature.

---

## Break it

1. **Defeat `noUncheckedIndexedAccess`.** In a pure module, change a safe `const x = arr[0];
   if (!x) ...` into `const x = arr[0]!` (non-null assertion) and remove the guard. It
   compiles — and you've reintroduced exactly the "assumed it existed" risk the flag was
   protecting against. Revert and feel why the strict flag is worth the friction.
2. **Sneak in `any`.** Type a function parameter as `any` and watch how it silently
   poisons everything it touches (no errors, no safety). This is what "no `any` in core
   paths" is defending.

---

## Exercises

- Pick any layer above (say L4) and identify which strict flag would have caught a plausible
  bug there (e.g., `rows[0]` being undefined). Tie the substrate back to the feature.
- Add a new `EMBEDDINGS_PROVIDER` enum value in `config.ts` *without* implementing it. Run
  `pnpm typecheck`. The exhaustive switch in `embeddings/index.ts` fails to compile. That
  compile error is the architecture protecting you.

---

## You've reached the substrate

From an agent's tool call (L0) all the way down to the compiler flags that keep it honest
(L10), you've traced the entire system. One rung remains — not a layer of the app, but the
**math** underneath retrieval. If you want the floor of the floor:

**[Appendix · Cosine similarity from scratch →](90-appendix-cosine-from-scratch.md)**
