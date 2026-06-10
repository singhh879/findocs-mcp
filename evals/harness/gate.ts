import type { Baseline, Scorecard } from "./types.js";

export interface GateFailure {
  metric: string;
  actual: number;
  threshold: number;
}

export interface GateOutcome {
  pass: boolean;
  failures: GateFailure[];
}

/**
 * Regression gate: compare a scorecard against the baseline thresholds.
 * Fails if any gated metric is below `threshold - epsilon`. This is what CI runs;
 * a single regressed metric turns the build red.
 */
export function checkGate(card: Scorecard, baseline: Baseline): GateOutcome {
  const checks: [string, number, number][] = [
    ["recall_at_k", card.recall_at_k, baseline.thresholds.recall_at_k],
    ["mrr", card.mrr, baseline.thresholds.mrr],
    ["faithfulness", card.faithfulness, baseline.thresholds.faithfulness],
    ["refusal_accuracy", card.refusal_accuracy, baseline.thresholds.refusal_accuracy],
  ];
  const failures: GateFailure[] = [];
  for (const [metric, actual, threshold] of checks) {
    if (actual < threshold - baseline.epsilon) {
      failures.push({ metric, actual, threshold });
    }
  }
  return { pass: failures.length === 0, failures };
}

/** Render gate failures for the console / CI log. */
export function formatGate(outcome: GateOutcome): string {
  if (outcome.pass) return "✓ eval gate passed — all metrics at or above baseline";
  const lines = outcome.failures.map(
    (f) =>
      `  ✗ ${f.metric}: ${f.actual.toFixed(4)} < baseline ${f.threshold.toFixed(4)}`,
  );
  return ["✗ eval gate FAILED — regression below baseline:", ...lines].join("\n");
}
