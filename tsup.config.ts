import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "mcp/server": "src/mcp/server.ts",
    "cli/ingest": "src/cli/ingest.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  // Keep native/optional deps external; they resolve at runtime from node_modules.
  external: ["@xenova/transformers", "postgres", "@modelcontextprotocol/sdk"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
