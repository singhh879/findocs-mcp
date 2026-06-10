// LEARN ▸ docs/learning/08-the-eval-loop.md — `pnpm eval` / `pnpm eval:gate` entry point
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
