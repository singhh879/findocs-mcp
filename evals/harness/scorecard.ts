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
