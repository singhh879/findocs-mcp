# FinDocs MCP

> An **eval-first, reliability-first** MCP server for semantic search and grounded
> Q&A over a financial-docs corpus — Postgres + pgvector for retrieval, a
> first-class eval-loop that **fails CI on regression**.

![CI](https://github.com/OWNER/findocs-mcp/actions/workflows/ci.yml/badge.svg)

FinDocs MCP gives an AI agent three tools over [MCP](https://modelcontextprotocol.io):
search a corpus of broker API documentation (Zerodha Kite Connect + Finvasia
Shoonya), ask grounded questions that come back **with citations**, and ingest new
documents. The interesting part isn't the RAG — it's the **evaluation harness**:
every change is scored on retrieval recall, ranking quality, answer faithfulness,
and refusal correctness, and a regression below baseline turns the build red.

This is the "tick-data validation, zero production mis-fires" discipline from quant
trading infrastructure, applied to AI tooling: **a confident wrong answer is worse
than an honest "not found."**

> 📚 **Learning the codebase?** The source is written as a *reverse-learning layer*: read
> it top-down from [`src/mcp/server.ts`](src/mcp/server.ts) (where an agent calls in) and
> follow the `▼ LEARN` comment blocks down through retrieval, embeddings, cosine/pgvector,
> chunking, the refusal gate, and the eval-loop — to the linear algebra at the bottom.
> Each concept is taught inline, right where it's implemented.

---

## Architecture

```
                 ┌─────────────────────────────────────────────┐
   MCP client    │                 MCP server (stdio)          │
 (Claude Code/   │   search_docs · answer_question · ingest_doc│
  Desktop) ─────▶│                                             │
                 └───────┬───────────────┬───────────────┬─────┘
                         │               │               │
                  ┌──────▼─────┐   ┌─────▼──────┐   ┌─────▼──────┐
                  │  Embedder  │   │ Retrieval  │   │   Ingest   │
                  │ (local     │   │ + QA gate  │   │ chunk→embed│
                  │  MiniLM)   │   │ + citations│   │  →upsert   │
                  └──────┬─────┘   └─────┬──────┘   └─────┬──────┘
                         └───────────────┼────────────────┘
                                  ┌──────▼───────┐
                                  │  Postgres +  │
                                  │   pgvector   │  HNSW cosine
                                  └──────────────┘

   evals/  ──▶  runner ──▶ metrics (recall@k · MRR · faithfulness · refusal)
                                  │
                                  ▼
                          baseline.json gate ──▶ CI pass/fail
```

Everything is **provider-agnostic behind thin adapters**:

| Concern    | Default (zero cost, no secrets)                    | Swap-in |
|------------|----------------------------------------------------|---------|
| Embeddings | `@xenova/transformers` MiniLM-L6-v2 (384-dim)      | OpenAI / Voyage |
| LLM        | deterministic heuristic (extractive + overlap judge) | local Ollama, or Anthropic / OpenAI |
| Store      | Postgres + pgvector (HNSW, cosine)                 | — |

The defaults run with **no API keys and no per-call cost**, which is exactly what
makes the eval gate reproducible in CI.

---

## MCP tools

| Tool | Description |
|------|-------------|
| `search_docs(query, k?)` | Top-k chunks with cosine similarity scores + source metadata. |
| `answer_question(question)` | Retrieves, applies a **confidence gate**, synthesizes a grounded answer **with citations**, or **refuses** with "not found" when retrieval confidence is low. |
| `ingest_doc({ url \| text, source?, title? })` | Chunk → embed → upsert. Idempotent on content. |

### The reliability core — the refusal gate

`answer_question` never synthesizes when retrieval confidence is below the
configured floor. It refuses instead. The eval set includes **out-of-corpus
negative cases** specifically to prove this behavior holds (see
[`src/qa/gate.ts`](src/qa/gate.ts)). With the default thresholds there is a clean
margin between in-corpus questions (top cosine ≥ 0.35) and out-of-corpus questions
(top cosine ≤ 0.31).

---

## The eval-loop (the centerpiece)

A labeled dataset of ~50 cases ([`evals/dataset.jsonl`](evals/dataset.jsonl)) —
question → expected supporting document(s), including negative/out-of-corpus cases.

**Metrics** ([`evals/harness/metrics.ts`](evals/harness/metrics.ts)):

| Metric | Question it answers |
|--------|---------------------|
| **recall@k** | Did the right document make it into the top-k? |
| **MRR** | How highly was the right document ranked? |
| **faithfulness** | Is the answer actually supported by the retrieved chunks? (LLM-as-judge; deterministic fallback) |
| **refusal accuracy** | Does it answer in-corpus questions and refuse out-of-corpus ones? |

**Runner** — `pnpm eval` prints a scorecard, writes
`evals/results/{timestamp}.json`, and appends a row to `evals/history.ndjson` so
you can track the **score-over-time curve**.

**Regression gate** — `pnpm eval:gate` compares the scorecard against
[`evals/baseline.json`](evals/baseline.json) and exits non-zero if any metric drops
below threshold (minus a small epsilon). CI runs this on every PR.

Current baseline (calibrated against the real corpus):

```
recall@5  0.92   ·   MRR  0.80   ·   faithfulness  0.80   ·   refusal accuracy  0.90
```

> **Offline smoke test:** `pnpm calibrate` runs the entire scoring pipeline with
> the real embedder against an in-memory index — **no database required** — useful
> for tuning thresholds and sanity-checking retrieval quality locally.

---

## Quickstart

**Prerequisites:** Node 20+, [pnpm](https://pnpm.io) (`corepack enable pnpm`), and
Docker (for the pgvector container).

```bash
pnpm install
cp .env.example .env          # defaults match docker-compose

pnpm db:up                    # start Postgres + pgvector (host port 5433)
pnpm db:wait                  # wait until it accepts connections
pnpm migrate                  # apply schema + HNSW index
pnpm ingest                   # chunk → embed → upsert the corpus

pnpm eval                     # print the scorecard
pnpm eval:gate                # run the regression gate (CI uses this)

pnpm dev                      # run the MCP server over stdio
```

> The first `pnpm ingest` / `pnpm eval` downloads the MiniLM model (~90 MB) and
> caches it under `.models/`.

---

## Using it from Claude Desktop / Claude Code

Build first (`pnpm build`), then point your MCP client at `dist/mcp/server.js`.

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "findocs": {
      "command": "node",
      "args": ["/absolute/path/to/findocs-mcp/dist/mcp/server.js"],
      "env": {
        "DATABASE_URL": "postgres://findocs:findocs@localhost:5433/findocs"
      }
    }
  }
}
```

**Claude Code** — register the server from the repo root:

```bash
claude mcp add findocs \
  --env DATABASE_URL=postgres://findocs:findocs@localhost:5433/findocs \
  -- node ./dist/mcp/server.js
```

Then ask things like *"Search the docs for how GTT OCO orders work"* or
*"How is the Kite Connect access token checksum computed?"* — and try an
out-of-corpus question to watch it refuse.

---

## 2-minute demo

> _Demo recording goes here — replace with an asciinema cast or GIF:_
>
> ```bash
> # record:
> asciinema rec demo.cast -c "pnpm eval && pnpm dev"
> ```
>
> ![demo](docs/demo.gif)

---

## Project layout

```
src/
  config.ts              zod-validated env
  db/                    postgres.js client + repo (upsert / vectorSearch / getChunk)
  embeddings/            Embedder interface + local transformers.js impl + factory
  llm/                   LLMProvider {synthesize, judge}: heuristic + ollama
  ingest/                chunk · load · pipeline
  retrieval/search.ts    search_docs core
  qa/                    confidence gate + grounded answer with citations
  mcp/server.ts          MCP stdio server (3 tools, zod schemas)
evals/
  dataset.jsonl          labeled cases (incl. negatives)
  harness/               metrics · runner · scorecard · gate (first-class module)
  baseline.json          regression thresholds
corpus/                  vendored broker API docs (deterministic eval base)
db/                      schema.sql · migrate · wait
scripts/calibrate.ts     offline eval (no DB) for threshold tuning
```

---

## Notes & scope

- **Corpus** is a curated, vendored subset of public broker API documentation for
  demo and reproducibility; it may lag the official docs. Treat it as a fixture,
  not a source of truth for live trading.
- TypeScript strict throughout (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  …), ESM, no `any` in core paths. Tests in vitest.
- Out of scope for v1: rerankers, hybrid BM25+vector, auth, web UI — the adapters
  are structured so these slot in without a rewrite.

## License

MIT — see [LICENSE](LICENSE).
