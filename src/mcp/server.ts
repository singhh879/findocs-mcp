// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L0–L1 · THE SURFACE — MCP & stdio   (start your descent here)
//
// This is the very top of the system: the part an AI agent (Claude Desktop /
// Claude Code) actually talks to. Before any embedding or SQL exists, *something*
// has to let the model call answer_question("..."). That something is MCP.
//
// MCP (Model Context Protocol) = "USB for AI tools". You implement a small server
// that advertises a list of tools; any MCP-aware client can discover and call
// them. Three ideas do all the work:
//   1. TRANSPORT — stdio. The client spawns this file as a subprocess and
//      exchanges JSON-RPC 2.0 messages over stdin/stdout. GOLDEN RULE: never
//      write to stdout except protocol messages — a stray console.log corrupts
//      the stream. All logs go to stderr (see log() below).
//   2. DISCOVERY — on connect, the client asks "what tools?"; we answer with each
//      tool's name + description + input JSON Schema. The model reads those to
//      decide WHEN and HOW to call. Good descriptions are part of the product.
//   3. INVOCATION — the client sends {name, arguments}; the SDK validates the
//      args against the schema BEFORE our handler runs, then we return `content`.
//
// Down the ladder ▼  next: src/services.ts + src/qa/answer.ts (the pipeline).
// ═══════════════════════════════════════════════════════════════════════════
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "../config.js";
import { createServices } from "../services.js";
import { searchDocs } from "../retrieval/search.js";
import { answerQuestion } from "../qa/answer.js";
import { ingestDocuments } from "../ingest/pipeline.js";
import { documentFromText, documentFromUrl, type SourceDocument } from "../ingest/load.js";

// LEARN: stdout is the MCP protocol channel — never write to it. Logs go to stderr.
// Try it: change this to process.stdout.write, rebuild, run `pnpm smoke` → it breaks.
function log(msg: string): void {
  process.stderr.write(`[findocs-mcp] ${msg}\n`);
}

// LEARN: an MCP tool result is a list of `content` blocks. We return one text
// block containing JSON — the model reads the JSON we hand back, nothing else.
function jsonResult(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  // LEARN: createServices() builds {sql, embedder, llm} but does NOT connect to
  // Postgres or load the embedding model — those are lazy. That's why this server
  // (and `pnpm smoke`) starts instantly with no database running.
  const services = createServices();

  const server = new McpServer({ name: "findocs-mcp", version: "0.1.0" });

  // LEARN: registerTool(name, config, handler). The `inputSchema` is a zod "raw
  // shape" {field: zodType}. The SDK (a) turns it into JSON Schema for the wire so
  // the model knows the argument shape, and (b) validates incoming args, handing
  // the handler a fully-typed object. One source of truth: validation + docs.
  server.registerTool(
    "search_docs",
    {
      title: "Search financial documents",
      description:
        "Semantic search over the indexed financial-docs corpus. Returns the top-k " +
        "chunks with cosine similarity scores and source metadata.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language search query"),
        k: z
          .number()
          .int()
          .positive()
          .max(20)
          .optional()
          .describe("Number of chunks to return (default from config)"),
      },
    },
    async ({ query, k }) => {
      const hits = await searchDocs(services, query, k ?? cfg.SEARCH_TOP_K);
      return jsonResult({
        query,
        count: hits.length,
        results: hits.map((h) => ({
          id: h.id,
          score: Number(h.score.toFixed(4)),
          source: h.source,
          title: h.title,
          url: h.url,
          content: h.content,
        })),
      });
    },
  );

  // LEARN: the flagship tool. Everything interesting (retrieval → confidence gate →
  // grounded synthesis → citations, or refusal) lives behind this one call, in
  // src/qa/answer.ts. The model just sees a question in and a cited answer out.
  server.registerTool(
    "answer_question",
    {
      title: "Answer a question with citations",
      description:
        "Retrieves relevant chunks, synthesizes a grounded answer with citations, and " +
        'refuses with "not found" when retrieval confidence is below the configured floor.',
      inputSchema: {
        question: z.string().min(1).describe("Question to answer from the corpus"),
      },
    },
    async ({ question }) => {
      const result = await answerQuestion(services, question);
      return jsonResult(result);
    },
  );

  // LEARN: tools can have side effects. ingest_doc writes to the DB. Note we accept
  // EITHER a url OR text (zod marks both optional) and enforce "at least one" in the
  // handler — schemas express shape; business rules still live in code.
  server.registerTool(
    "ingest_doc",
    {
      title: "Ingest a document",
      description:
        "Chunk → embed → upsert a document into pgvector. Provide either a URL to fetch " +
        "or raw text. Re-ingesting identical content is idempotent.",
      inputSchema: {
        url: z.string().url().optional().describe("URL to fetch and ingest"),
        text: z.string().min(1).optional().describe("Raw document text to ingest"),
        source: z.string().optional().describe("Source slug (e.g. zerodha)"),
        title: z.string().optional().describe("Document title"),
      },
    },
    async ({ url, text, source, title }) => {
      let doc: SourceDocument;
      if (url) {
        doc = await documentFromUrl(url);
        if (source) doc.source = source;
        if (title) doc.title = title;
      } else if (text) {
        doc = documentFromText(text, { source, title });
      } else {
        return jsonResult({ error: "provide either `url` or `text`" });
      }
      const result = await ingestDocuments(services.sql, services.embedder, [doc]);
      return jsonResult({ ...result, docId: doc.docId, source: doc.source });
    },
  );

  // LEARN: this single line binds the JSON-RPC request/response loop to stdin/stdout.
  // After connect(), the SDK handles initialize/tools-list/tools-call framing for us.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready — provider embeddings=${services.embedder.id} llm=${services.llm.id}`);
}

main().catch((err: unknown) => {
  log(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
