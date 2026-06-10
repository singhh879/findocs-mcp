// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  AN MCP CLIENT — the other half of L0
//
// server.ts is the MCP server; THIS is a tiny MCP client. It spawns the built server
// as a subprocess and calls listTools() — exactly what Claude does under the hood
// when it connects. Reading both sides makes "what is MCP" concrete: a client, a
// server, and JSON-RPC over stdio between them.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Smoke test: spawn the built MCP server over stdio and list its tools.
 * Verifies the MCP wiring end-to-end without needing a database (the DB
 * connection and embedding model are created lazily, on first tool call).
 *
 * Usage: pnpm build && pnpm exec tsx scripts/smoke-mcp.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

async function main(): Promise<void> {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const transport = new StdioClientTransport({
    command: process.execPath, // absolute path to the node binary (Windows-safe)
    args: [join(root, "dist", "mcp", "server.js")],
  });
  const client = new Client({ name: "findocs-smoke", version: "0.1.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log("tools:", tools.map((t) => t.name).join(", "));
  if (tools.length !== 3) throw new Error(`expected 3 tools, got ${tools.length}`);

  await client.close();
  console.log("✓ MCP server responded over stdio");
}

main().catch((err: unknown) => {
  console.error("smoke failed:", err);
  process.exitCode = 1;
});
