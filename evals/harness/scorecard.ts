// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L8 · REPORT & REMEMBER — the scorecard and the score-over-time trail
//
// Two outputs from each run:
//   • A full RunArtifact → evals/results/{timestamp}.json. It contains the scorecard
//     AND every per-case outcome (what was retrieved, refused, grounded score). That
//     file is your debugging microscope — sort by recall===0 to find retrieval
//     misses, by (type===negative && !refused) to find leaks.
//   • One compact aggregate line appended to evals/history.ndjson — the SCORE-OVER-
//     TIME trail, so you can plot the eval curve improving as you tune the system.
// ═══════════════════════════════════════════════════════════════════════════
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CaseResult, Scorecard } from "./types.js";

export interface RunMeta {
  embedderId: string;
  llmId: string;
  k: number;
}

/** A persisted eval run: scorecard + metadata + per-case detail. */
export interface RunArtifact {
  timestamp: string;
  meta: RunMeta;
  scorecard: Scorecard;
  cases: CaseResult[];
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Render the scorecard as a readable console table. */
export function formatScorecard(card: Scorecard, meta: RunMeta): string {
  const rows: [string, string][] = [
    [`recall@${meta.k}`, pct(card.recall_at_k)],
    ["MRR", card.mrr.toFixed(4)],
    ["faithfulness", pct(card.faithfulness)],
    ["refusal accuracy", pct(card.refusal_accuracy)],
    ["answer rate", pct(card.answer_rate)],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  const lines = rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`);
  return [
    "Eval scorecard",
    // LEARN: stamping the embedder + llm ids means a score is always attributable to
    // the exact providers that produced it (heuristic vs ollama, which model).
    `  embedder=${meta.embedderId}  llm=${meta.llmId}`,
    `  cases=${card.counts.total} (positive=${card.counts.positive}, negative=${card.counts.negative}, answered=${card.counts.answered})`,
    "",
    ...lines,
  ].join("\n");
}

/**
 * Persist a run: full artifact to evals/results/{timestamp}.json and a compact
 * aggregate line appended to evals/history.ndjson (for the score-over-time curve).
 */
export async function persistRun(
  resultsDir: string,
  historyPath: string,
  artifact: RunArtifact,
): Promise<string> {
  await mkdir(resultsDir, { recursive: true });
  const safeTs = artifact.timestamp.replace(/[:.]/g, "-");
  const outPath = join(resultsDir, `${safeTs}.json`);
  await writeFile(outPath, JSON.stringify(artifact, null, 2), "utf8");

  await mkdir(dirname(historyPath), { recursive: true });
  // LEARN: NDJSON (one JSON object per line) is append-only and trivially streamable —
  // perfect for an ever-growing history you might later chart.
  const historyLine =
    JSON.stringify({
      timestamp: artifact.timestamp,
      embedder: artifact.meta.embedderId,
      llm: artifact.meta.llmId,
      ...artifact.scorecard,
    }) + "\n";
  await appendFile(historyPath, historyLine, "utf8");

  return outPath;
}
