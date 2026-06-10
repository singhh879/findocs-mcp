// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L2 · DEPENDENCY INJECTION — the {sql, embedder, llm} bundle
//
// The logic in this codebase (answerQuestion, runEval, ...) never reaches out and
// grabs a database or a model. It RECEIVES them in a `deps` object. That's
// dependency injection (DI), and it buys three things:
//   • Testable  — a test can pass a fake llm/embedder; no network, no Docker.
//   • Swappable — local vs cloud embedder, heuristic vs Ollama LLM, decided once
//                 here at the edge, never threaded through the business logic.
//   • Honest    — a function's signature tells you exactly what it can touch.
//
// Each get*() below is a FACTORY (defined near its adapter): read config, build the
// configured implementation, memoize it. They are lazy — calling createServices()
// does not open a DB connection or load MiniLM until first real use.
//
// Down the ladder ▼  next: src/qa/answer.ts (uses these deps to answer a question).
// ═══════════════════════════════════════════════════════════════════════════
import { getSql, type Sql } from "./db/client.js";
import { getEmbedder, type Embedder } from "./embeddings/index.js";
import { getLLMProvider, type LLMProvider } from "./llm/index.js";

/** The wired dependencies shared by the MCP server, CLI, and eval runner. */
export interface Services {
  sql: Sql;
  embedder: Embedder;
  llm: LLMProvider;
}

/** Construct the default, config-driven service graph. */
export function createServices(): Services {
  return {
    sql: getSql(),
    embedder: getEmbedder(),
    llm: getLLMProvider(),
  };
}
