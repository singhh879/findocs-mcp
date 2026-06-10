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
