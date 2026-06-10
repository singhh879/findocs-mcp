import { getSql, closeSql } from "../src/db/client.js";

/** Poll the database until it accepts connections (used after `db:up`). */
async function waitForDb(maxAttempts = 30, delayMs = 1000): Promise<void> {
  const sql = getSql();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sql`SELECT 1`;
      console.log("✓ database ready");
      return;
    } catch {
      if (attempt === maxAttempts) throw new Error("database did not become ready in time");
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

waitForDb()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeSql());
