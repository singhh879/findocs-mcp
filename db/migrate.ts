// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L4 (setup) · `pnpm migrate` — apply the schema
//
// Applies db/schema.sql (CREATE EXTENSION vector, the chunks table, the HNSW index).
// The schema is written idempotently (IF NOT EXISTS everywhere), so this is safe to
// run repeatedly — which is why CI can run it unconditionally before ingest.
// ═══════════════════════════════════════════════════════════════════════════
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getSql, closeSql } from "../src/db/client.js";

/**
 * Apply db/schema.sql. The schema is written to be idempotent (IF NOT EXISTS
 * everywhere), so this is safe to run repeatedly.
 */
async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(here, "schema.sql");
  const schema = await readFile(schemaPath, "utf8");

  const sql = getSql();
  await sql.unsafe(schema);
  console.log("✓ schema applied");
}

migrate()
  .catch((err: unknown) => {
    console.error("migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeSql());
