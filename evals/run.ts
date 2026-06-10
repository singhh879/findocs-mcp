// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L8 · THE EVAL ENTRY POINT — `pnpm eval` and `pnpm eval:gate`
//
// Ties the harness together: load + VALIDATE the dataset and baseline (zod, so bad
// data fails loudly), build services, run the dataset against the real pgvector
// path, print the scorecard, persist the artifact + history line. With `--gate` it
// additionally runs checkGate and sets a non-zero EXIT CODE on regression — that
// exit code is what makes CI go red. (No DB? `scripts/calibrate.ts` runs the same
// scoring in-memory with no Postgres.)
// ═══════════════════════════════════════════════════════════════════════════
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

import { loadConfig } from "../src/config.js";
import { createServices } from "../src/services.js";
import { closeSql } from "../src/db/client.js";
import { countChunks } from "../src/db/repo.js";
import { runEval } from "./harness/runner.js";
import { aggregate } from "./harness/metrics.js";
import { formatScorecard, persistRun, type RunArtifact } from "./harness/scorecard.js";
import { checkGate, formatGate } from "./harness/gate.js";
import type { Baseline, EvalCase } from "./harness/types.js";

// LEARN: validate the dataset at the boundary (same rule as config.ts). A typo in
// dataset.jsonl becomes a clear error, not a silently-skewed score.
const EvalCaseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  expected_sources: z.array(z.string()).default([]),
  expected_answer: z.string().optional(),
  type: z.enum(["positive", "negative"]),
});

const BaselineSchema = z.object({
  k: z.number().int().positive(),
  thresholds: z.object({
    recall_at_k: z.number().min(0).max(1),
    mrr: z.number().min(0).max(1),
    faithfulness: z.number().min(0).max(1),
    refusal_accuracy: z.number().min(0).max(1),
  }),
  epsilon: z.number().min(0).max(1),
});

async function loadDataset(path: string): Promise<EvalCase[]> {
  const raw = await readFile(path, "utf8");
  const cases: EvalCase[] = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    const parsed = EvalCaseSchema.safeParse(JSON.parse(trimmed));
    if (!parsed.success) {
      throw new Error(`dataset line ${i + 1} invalid: ${parsed.error.message}`);
    }
    // Drop `expected_answer` when absent rather than storing `undefined`
    // (exactOptionalPropertyTypes), keeping the EvalCase shape clean.
    const { expected_answer, ...rest } = parsed.data;
    cases.push(expected_answer === undefined ? rest : { ...rest, expected_answer });
  });
  return cases;
}

async function main(): Promise<void> {
  const gateMode = process.argv.includes("--gate");
  const here = dirname(fileURLToPath(import.meta.url));

  const cases = await loadDataset(join(here, "dataset.jsonl"));
  const baseline = BaselineSchema.parse(
    JSON.parse(await readFile(join(here, "baseline.json"), "utf8")),
  ) satisfies Baseline;

  const cfg = loadConfig();
  const k = baseline.k || cfg.SEARCH_TOP_K;
  const services = createServices();

  // LEARN: fail fast if the corpus is empty — a 0% score from "nothing ingested" is a
  // setup bug, not a quality regression, and we don't want to confuse the two.
  const chunks = await countChunks(services.sql);
  if (chunks === 0) {
    throw new Error("corpus is empty — run `pnpm migrate` then `pnpm ingest` first");
  }

  const results = await runEval(services, cases, k);
  const card = aggregate(results);
  const meta = { embedderId: services.embedder.id, llmId: services.llm.id, k };

  console.log(formatScorecard(card, meta));

  const artifact: RunArtifact = {
    timestamp: new Date().toISOString(),
    meta,
    scorecard: card,
    cases: results,
  };
  const outPath = await persistRun(
    join(here, "results"),
    join(here, "history.ndjson"),
    artifact,
  );
  console.log(`\nWrote ${outPath}`);

  if (gateMode) {
    // LEARN: this is the whole point — a regression sets process.exitCode = 1, which
    // fails the CI step and (with branch protection) blocks the merge.
    const outcome = checkGate(card, baseline);
    console.log("\n" + formatGate(outcome));
    if (!outcome.pass) process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error("eval failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeSql());
