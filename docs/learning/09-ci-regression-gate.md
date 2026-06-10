# L9 · The CI regression gate

> **You are here:** the eval gate exists, but a gate nobody pulls is decoration. We descend
> into how it runs **automatically on every push/PR**, against a real database, with zero
> secrets and zero cost.
>
> **Code for this rung:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

---

## The concept

**Continuous Integration (CI)** runs your checks on a clean machine every time code
changes. For this project the CI job is the *enforcement arm* of L8: it reproduces the
whole pipeline and fails the build if quality regressed.

Three properties make it trustworthy:

1. **Real dependencies, not mocks.** The eval runs against an actual Postgres + pgvector,
   so the retrieval path under test is the production one. GitHub Actions provides this via
   a **service container** — a Docker container (here `pgvector/pgvector:pg16`) that lives
   beside your job and is reachable on `localhost`.
2. **Deterministic & secret-free.** CI uses the **local embedder + heuristic LLM** defaults
   (L3, L7). No API keys, no network model calls, no per-run cost — so the result depends
   only on your code and the fixed corpus. A gate that flaps for external reasons trains
   people to ignore it.
3. **Caching for speed.** The MiniLM model is downloaded once and cached between runs, so
   CI isn't re-fetching ~90 MB every time.

### Why gate in CI and not just locally?

Locally, you *can* skip the check. CI *can't* be skipped (with branch protection, a failing
required check blocks merge). That's the difference between "we have evals" and "regressions
cannot reach `main`."

---

## In this codebase

Read [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) top to bottom:

- **Triggers:** `on: push` / `pull_request` to `main`.
- **Service container:**
  ```yaml
  services:
    db:
      image: pgvector/pgvector:pg16
      ports: ["5432:5432"]
      options: >-
        --health-cmd "pg_isready -U findocs -d findocs" ...
  ```
  The health-check options make the job wait until Postgres actually accepts connections
  before steps run.
- **Env:** `DATABASE_URL` points at the service; `EMBEDDINGS_PROVIDER=local`,
  `LLM_PROVIDER=heuristic`, `TRANSFORMERS_CACHE=.models` — the zero-cost, deterministic
  configuration.
- **Model cache:** `actions/cache@v4` keyed on the OS, caching `.models/`.
- **The pipeline of steps** — this is L0–L8 executed in order on a clean box:
  ```
  pnpm install --frozen-lockfile   # exact deps from the lockfile
  pnpm typecheck                   # strict TS must pass (L10)
  pnpm test                        # unit + the DB-gated integration test (now un-skipped!)
  pnpm migrate                     # apply schema + HNSW index (L4)
  pnpm ingest                      # chunk → embed → upsert the corpus (L5)
  pnpm eval:gate                   # run evals, FAIL the build on regression (L8)
  ```
  Notice the integration test from L4 *runs here* because `DATABASE_URL` is set — locally
  it skipped.
- **Artifacts:** `actions/upload-artifact` saves `evals/results/*.json` and
  `history.ndjson` even on failure (`if: always()`), so you can download the scorecard from
  a red run and see exactly which metric fell.

---

## Trace it yourself

- **Read it as a script.** Every step is a `pnpm` command you can run locally (with Docker
  up). CI is just "these commands, on a clean machine, every time." Run them in sequence
  once and you've *been* the CI.
- **`--frozen-lockfile`** is worth pausing on: it makes installs reproducible by refusing to
  silently change `pnpm-lock.yaml`. Reproducibility again.

---

## Break it

1. **Push a regression.** Make one of the L8 "break it" changes on a branch and open a PR.
   The **Eval regression gate** step turns red, the check fails, and (with branch
   protection) merge is blocked. Download the artifact to see the failing metric. This is
   the entire payoff of the project in one screenshot.
2. **Break determinism on purpose.** Switch CI's `LLM_PROVIDER` to `ollama` (which isn't
   installed on the runner). Watch the heuristic *fallback* keep it green anyway — the
   defensive design from L7 means CI degrades gracefully rather than exploding. Revert.

---

## Exercises

- Why run `typecheck` and `test` *before* `migrate`/`ingest`/`eval`? (Order by cost and by
  what fails fastest — cheap checks first.)
- Branch protection makes the CI check *required*. Write the one-sentence policy you'd put
  in the repo settings to guarantee "no regression reaches main."

---

## Go deeper (the next rung down)

You've now seen the system, its measurement, and its enforcement. The last descent is into
the *engineering substrate* that made all of this safe to build and change. Descend to
**[L10 · TypeScript & architecture →](10-typescript-and-architecture.md)**.
