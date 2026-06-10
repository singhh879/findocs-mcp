import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getSql, closeSql } from "../src/db/client.js";
import { upsertChunks, vectorSearch, getChunk, type ChunkInput } from "../src/db/repo.js";

// Integration test: only runs when a database is configured (CI service container
// or local `pnpm db:up`). Skipped otherwise so unit tests stay fast/offline.
const hasDb = Boolean(process.env["DATABASE_URL"]);

/** Build a 384-dim unit vector with a single "hot" dimension. */
function oneHot(index: number): number[] {
  const v = new Array<number>(384).fill(0);
  v[index % 384] = 1;
  return v;
}

const ID_A = "itest-aaaaaaaaaaaaaaaaaaaaaaaaaaaa01";
const ID_B = "itest-bbbbbbbbbbbbbbbbbbbbbbbbbbbb02";

describe.skipIf(!hasDb)("db/repo (integration)", () => {
  beforeAll(async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const schema = await readFile(join(here, "..", "db", "schema.sql"), "utf8");
    const sql = getSql();
    await sql.unsafe(schema);
  });

  afterAll(async () => {
    const sql = getSql();
    await sql`DELETE FROM chunks WHERE id IN (${ID_A}, ${ID_B})`;
    await closeSql();
  });

  it("upserts, searches by cosine similarity, and fetches by id", async () => {
    const sql = getSql();
    const chunks: ChunkInput[] = [
      { id: ID_A, docId: "t/a", source: "t", title: "A", url: null, ord: 0, content: "alpha content", embedding: oneHot(0) },
      { id: ID_B, docId: "t/b", source: "t", title: "B", url: null, ord: 0, content: "beta content", embedding: oneHot(1) },
    ];
    const n = await upsertChunks(sql, chunks);
    expect(n).toBe(2);

    // Query near A => A should rank first with similarity ~1.
    const hits = await vectorSearch(sql, oneHot(0), 5);
    const top = hits.find((h) => h.id === ID_A);
    expect(top).toBeDefined();
    expect(top?.score ?? 0).toBeGreaterThan(0.99);
    const rankA = hits.findIndex((h) => h.id === ID_A);
    const rankB = hits.findIndex((h) => h.id === ID_B);
    expect(rankA).toBeLessThan(rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB);

    // Upsert is idempotent on id.
    const again = await upsertChunks(sql, chunks);
    expect(again).toBe(2);

    const fetched = await getChunk(sql, ID_A);
    expect(fetched?.content).toBe("alpha content");
  });
});
