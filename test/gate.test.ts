import { describe, it, expect } from "vitest";
import { evaluateConfidence } from "../src/qa/gate.js";
import { checkGate } from "../evals/harness/gate.js";
import type { Baseline, Scorecard } from "../evals/harness/types.js";

describe("evaluateConfidence (refusal gate)", () => {
  const thresholds = { minTopSimilarity: 0.35, minMeanSimilarity: 0.28 };

  it("refuses when there are no results", () => {
    expect(evaluateConfidence([], thresholds).pass).toBe(false);
  });
  it("refuses when top similarity is below the floor", () => {
    const d = evaluateConfidence([0.2, 0.1], thresholds);
    expect(d.pass).toBe(false);
    expect(d.reason).toMatch(/top similarity/);
  });
  it("refuses when mean similarity is below the floor even if top passes", () => {
    const d = evaluateConfidence([0.4, 0.05, 0.05], thresholds);
    expect(d.pass).toBe(false);
    expect(d.reason).toMatch(/mean similarity/);
  });
  it("passes when both top and mean clear the floors", () => {
    const d = evaluateConfidence([0.6, 0.5, 0.4], thresholds);
    expect(d.pass).toBe(true);
    expect(d.topSimilarity).toBe(0.6);
  });
});

describe("checkGate (regression gate)", () => {
  const baseline: Baseline = {
    k: 5,
    thresholds: { recall_at_k: 0.85, mrr: 0.75, faithfulness: 0.7, refusal_accuracy: 0.9 },
    epsilon: 0.02,
  };
  const base: Scorecard = {
    recall_at_k: 0.9,
    mrr: 0.8,
    faithfulness: 0.75,
    refusal_accuracy: 1,
    answer_rate: 1,
    counts: { total: 10, positive: 8, negative: 2, answered: 8 },
  };

  it("passes when all metrics meet the baseline", () => {
    expect(checkGate(base, baseline).pass).toBe(true);
  });
  it("fails and reports the regressed metric", () => {
    const regressed: Scorecard = { ...base, recall_at_k: 0.6 };
    const outcome = checkGate(regressed, baseline);
    expect(outcome.pass).toBe(false);
    expect(outcome.failures.map((f) => f.metric)).toContain("recall_at_k");
  });
  it("tolerates jitter within epsilon", () => {
    const jitter: Scorecard = { ...base, mrr: 0.74 };
    expect(checkGate(jitter, baseline).pass).toBe(true);
  });
});
