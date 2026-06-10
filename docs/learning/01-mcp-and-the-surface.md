# L0–L1 · The surface: MCP and stdio

> **You are here:** the very top. An AI agent (Claude Desktop/Code) wants to use your
> tools. Before any embedding or SQL exists, *something* has to let the model call
> `answer_question("How is the Kite access token checksum computed?")`. That something
> is **MCP**.
>
> **Code for this rung:** [`src/mcp/server.ts`](../../src/mcp/server.ts)

---

## The concept

**MCP (Model Context Protocol)** is a standard way to expose *tools* (and resources and
prompts) to an LLM application. Think of it as "USB for AI tools": you implement a small
server that advertises a list of tools, and any MCP-aware client (Claude, etc.) can
discover and call them. You write the tool once; every MCP client can use it.

Three ideas do all the work:

1. **Transport — stdio.** Our server talks over **standard input/output** using
   JSON-RPC 2.0 messages (newline-delimited JSON). The client *spawns your server as a
   subprocess* and writes JSON to its stdin, reads JSON from its stdout. That's why a
   golden rule appears in the code: **never `console.log` in an stdio MCP server** —
   stdout is the protocol channel; a stray log corrupts the JSON stream. All our logs go
   to **stderr** instead.

2. **Discovery — `tools/list`.** On connect, the client asks "what tools do you have?"
   The server answers with each tool's `name`, `description`, and an **input JSON
   Schema**. The model reads those descriptions to decide *when* and *how* to call them.
   Good descriptions are part of the product.

3. **Invocation — `tools/call`.** The client sends `{name, arguments}`; the server runs
   the handler and returns `content` (here, a JSON text block). The arguments are
   validated against the schema *before* your handler runs.

### Why a schema per tool?

The model emits arguments as text. The schema (a) tells the model the shape to produce,
and (b) lets the runtime reject malformed calls deterministically. We declare schemas
with **zod**, and the MCP SDK turns them into JSON Schema for the wire. One source of
truth, both for validation and for documentation.

---

## In this codebase

Open [`src/mcp/server.ts`](../../src/mcp/server.ts). The whole surface is ~130 lines.

- We create the server:
  ```ts
  const server = new McpServer({ name: "findocs-mcp", version: "0.1.0" });
  ```
- We register **three tools** with `server.registerTool(name, config, handler)`. Look at
  `search_docs`: its `inputSchema` is a *zod raw shape* —
  ```ts
  inputSchema: {
    query: z.string().min(1).describe("Natural-language search query"),
    k: z.number().int().positive().max(20).optional(),
  }
  ```
  The SDK validates incoming arguments against this and hands your handler a typed
  `{ query, k }`. No manual parsing, no `any`.
- The handler returns a result via `jsonResult(payload)`, which wraps your object as an
  MCP `content` block of `type: "text"`.
- The **stdout discipline**: `log()` writes to `process.stderr`, and there's a comment
  flagging exactly why. The model only ever sees what you put in the `content` you
  return.
- Finally:
  ```ts
  const transport = new StdioServerTransport();
  await server.connect(transport);
  ```
  That binds the JSON-RPC loop to stdin/stdout.

Notice what the server *doesn't* do: it doesn't open a DB connection or load the
embedding model at startup. `createServices()` builds those **lazily** (next chapter), so
`tools/list` is instant and the server starts even with no database running. That's why
the smoke test works without Docker.

---

## Trace it yourself

```bash
pnpm build      # the smoke client spawns the built server
pnpm smoke
```

You'll see:
```
[findocs-mcp] ready — provider embeddings=local:... llm=heuristic:v1   ← on STDERR
tools: search_docs, answer_question, ingest_doc
✓ MCP server responded over stdio
```

Read [`scripts/smoke-mcp.ts`](../../scripts/smoke-mcp.ts): it's a *client*. It uses the
SDK's `Client` + `StdioClientTransport` to spawn the server, calls `client.listTools()`
(that's the `tools/list` request), and asserts three tools come back. This is exactly
what Claude does under the hood when it connects.

### See the actual wire (optional)

Run the server directly and watch it ignore non-JSON, or hand it a real JSON-RPC frame.
The handshake is: `initialize` → `notifications/initialized` → `tools/list`. You don't
need to do this by hand — but knowing the sequence demystifies "what is MCP."

---

## Break it

1. **Corrupt the protocol on purpose.** In `server.ts`, temporarily change the `log()`
   helper to use `process.stdout.write` instead of `process.stderr.write`, rebuild, and
   run `pnpm smoke`. It breaks — the client can no longer parse the stream, because your
   log is now mixed into the JSON-RPC channel. Revert it. *This is the #1 footgun of
   stdio servers; now you've felt it.*
2. **Tighten a schema.** Change `query: z.string().min(1)` to `.min(5)` and call
   `search_docs` with a 3-char query — the call is rejected before your handler runs.

---

## Exercises

- Add a fourth (read-only) tool `count_chunks()` that returns `countChunks(sql)` from
  [`src/db/repo.ts`](../../src/db/repo.ts). Register it, rebuild, and confirm `pnpm smoke`
  now lists four tools. (You just learned the full add-a-tool loop.)
- In one sentence each, write the `description` you'd give a model for `search_docs` vs
  `answer_question` so it picks the right one. Compare with the ones in the code.

---

## Go deeper (the next rung down)

You now know *how the call arrives*. The natural next question is *what happens when
`answer_question` runs* — how the dependencies are wired and how a question descends into
retrieval. That's **[L2 · The answer pipeline →](02-the-answer-pipeline.md)**.

**Foundational references:** the MCP spec (modelcontextprotocol.io), JSON-RPC 2.0,
JSON Schema. But don't rabbit-hole — you only need "tools + schemas + a stdio JSON-RPC
loop," which you've now seen end to end.
