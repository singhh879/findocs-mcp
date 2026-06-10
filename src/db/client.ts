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
