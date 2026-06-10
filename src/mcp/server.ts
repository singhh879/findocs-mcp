// LEARN ▸ docs/learning/01-mcp-and-the-surface.md — how an agent calls these tools (MCP/stdio)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "../config.js";
import { createServices } from "../services.js";
import { searchDocs } from "../retrieval/search.js";
import { answerQuestion } from "../qa/answer.js";
import { ingestDocuments } from "../ingest/pipeline.js";
import { documentFromText, documentFromUrl, type SourceDocument } from "../ingest/load.js";

// NOTE: stdout is the MCP protocol channel — never write to it. Logs go to stderr.
function log(msg: string): void {
  process.stderr.write(`[findocs-mcp] ${msg}\n`);
}

function jsonResult(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const services = createServices();

  const server = new McpServer({ name: "findocs-mcp", version: "0.1.0" });

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready — provider embeddings=${services.embedder.id} llm=${services.llm.id}`);
}

main().catch((err: unknown) => {
  log(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
