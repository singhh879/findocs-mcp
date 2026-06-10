// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L5 (entry point) · the `pnpm ingest` CLI
//
// Thin wrapper that wires the real pieces together for a one-shot run: build the
// services, load the corpus dir, ingest, report counts, close the pool. Same
// ingestDocuments() the MCP ingest_doc tool and the eval setup use — one code path,
// several entry points. Run order in practice: `pnpm migrate` (schema) then
// `pnpm ingest` (fill it).
// ═══════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { closeSql, getSql } from "../db/client.js";
import { getEmbedder } from "../embeddings/index.js";
import { ingestDocuments } from "../ingest/pipeline.js";
import { loadCorpusDir } from "../ingest/load.js";
import { countChunks } from "../db/repo.js";

/**
 * CLI: ingest the local corpus into pgvector.
 * Usage: pnpm ingest [corpusDir]   (default: ./corpus)
 */
async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const arg = process.argv[2];
  const corpusDir = arg ? resolve(arg) : join(repoRoot, "corpus");

  const sql = getSql();
  const embedder = getEmbedder();

  console.log(`Loading corpus from ${corpusDir} …`);
  const docs = await loadCorpusDir(corpusDir);
  if (docs.length === 0) {
    console.error(`No .md documents found under ${corpusDir}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Embedding with ${embedder.id} and upserting …`);
  const result = await ingestDocuments(sql, embedder, docs);
  const total = await countChunks(sql);
  console.log(
    `✓ ingested ${result.documents} documents → ${result.chunks} chunks (corpus total: ${total})`,
  );
}

main()
  .catch((err: unknown) => {
    console.error("ingest failed:", err);
    process.exitCode = 1;
  })
  // LEARN: always close the pool so the process exits — unlike the long-lived MCP
  // server, a CLI must release its connection and terminate.
  .finally(() => closeSql());
