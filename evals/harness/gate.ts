// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L8/L9 · THE REGRESSION GATE — metrics are useless if nobody enforces them
//
// A baseline file (evals/baseline.json) stores a threshold per metric. After a run,
// checkGate compares the scorecard to the baseline and FAILS (returns pass:false,
// and run.ts sets a non-zero exit code) if ANY metric dropped below its threshold —
// minus a tiny epsilon so floating-point jitter doesn't flip the gate. Wire that into
// CI (.github/workflows/ci.yml) and a quality regression CANNOT merge.
//
// This is "tick-data validation, zero mis-fires" applied to AI: the build is the
// safety net. To raise the bar over time, improve something and then RAISE the
// baseline — the gate ratchets quality upward. Tested in test/gate.test.ts.
// ═══════════════════════════════════════════════════════════════════════════
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
    // LEARN: the `- epsilon` slack distinguishes "real regression" from "0.001 of
    // numerical noise". Set epsilon too high and you stop catching small real drops.
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
