// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  the public library surface (a "barrel")
//
// Re-exports the pieces a consumer of findocs-mcp-as-a-library would import. It's a
// map of the package: skim it to see the building blocks (search, answer, gate,
// ingest, embedder, llm) without opening every folder. The MCP server is the app;
// this is the library face of the same code.
// ═══════════════════════════════════════════════════════════════════════════

/** Public library surface for findocs-mcp. */
export { loadConfig, type AppConfig } from "./config.js";
export { createServices, type Services } from "./services.js";

export { searchDocs, type SearchHit, type SearchDeps } from "./retrieval/search.js";
export {
  answerQuestion,
  NOT_FOUND_MESSAGE,
  type AnswerResult,
  type AnswerDeps,
  type Citation,
} from "./qa/answer.js";
export { evaluateConfidence, type GateThresholds, type GateDecision } from "./qa/gate.js";

export { ingestDocuments, chunkId, type IngestResult } from "./ingest/pipeline.js";
export {
  loadCorpusDir,
  documentFromText,
  documentFromUrl,
  type SourceDocument,
} from "./ingest/load.js";
export { chunkMarkdown, type RawChunk, type ChunkOptions } from "./ingest/chunk.js";

export { getEmbedder, type Embedder } from "./embeddings/index.js";
export {
  getLLMProvider,
  HeuristicProvider,
  judgeGroundedness,
  type LLMProvider,
  type RetrievedContext,
  type JudgeResult,
} from "./llm/index.js";
