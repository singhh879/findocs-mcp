// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L4 (plumbing) · the Postgres connection
//
// One postgres.js pool per process, created lazily. Nothing conceptual here — it's
// the IO edge that repo.ts's pure-ish SQL functions run against. Keeping the client
// behind getSql() means the rest of the code receives `sql` via DI and never imports
// a global connection directly (easier to test, one place to configure).
// ═══════════════════════════════════════════════════════════════════════════
import postgres from "postgres";
import { loadConfig } from "../config.js";

export type Sql = postgres.Sql;

let client: Sql | null = null;

/**
 * Lazily-created postgres.js client (one pool per process).
 *
 * `prepare: false` keeps us compatible with poolers and avoids prepared-statement
 * caching surprises; this is a low-QPS local tool, not a hot path.
 */
export function getSql(): Sql {
  if (client) return client;
  const { DATABASE_URL } = loadConfig();
  client = postgres(DATABASE_URL, {
    prepare: false,
    onnotice: () => {},
  });
  return client;
}

/** Close the pool (used by CLIs/eval runner so the process can exit cleanly). */
export async function closeSql(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
  }
}
