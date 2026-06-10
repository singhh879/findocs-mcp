import { describe, it, expect } from "vitest";
import {
  recallAtK,
  reciprocalRank,
  refusalCorrect,
  mean,
  aggregate,
} from "../evals/harness/metrics.js";
import type { CaseResult } from "../evals/harness/types.js";

describe("recallAtK", () => {
  it("is 1 when the expected doc is within top-k", () => {
    expect(recallAtK(["a", "b", "c"], ["b"], 5)).toBe(1);
  });
  it("is 0 when the expected doc is outside top-k", () => {
    expect(recallAtK(["a", "b", "c"], ["b"], 1)).toBe(0);
  });
  it("returns the fraction of expected docs found", () => {
    expect(recallAtK(["a", "b", "c"], ["b", "z"], 5)).toBe(0.5);
  });
  it("is 0 when nothing is expected", () => {
    expect(recallAtK(["a"], [], 5)).toBe(0);
  });
});

describe("reciprocalRank", () => {
  it("uses the rank of the first relevant hit", () => {
    expect(reciprocalRank(["x", "y", "target"], ["target"])).toBeCloseTo(1 / 3);
  });
  it("is 1 when the first hit is relevant", () => {
    expect(reciprocalRank(["target", "y"], ["target"])).toBe(1);
  });
  it("is 0 when no hit is relevant", () => {
    expect(reciprocalRank(["x", "y"], ["target"])).toBe(0);
  });
});

describe("refusalCorrect", () => {
  it("negatives are correct only when refused", () => {
    expect(refusalCorrect("negative", true)).toBe(true);
    expect(refusalCorrect("negative", false)).toBe(false);
  });
  it("positives are correct only when answered", () => {
    expect(refusalCorrect("positive", false)).toBe(true);
    expect(refusalCorrect("positive", true)).toBe(false);
  });
});

describe("aggregate", () => {
  const cases: CaseResult[] = [
    { id: "p1", type: "positive", question: "", retrievedDocIds: ["a"], recall: 1, reciprocalRank: 1, refused: false, grounded: 0.9, answer: "x" },
    { id: "p2", type: "positive", question: "", retrievedDocIds: ["b"], recall: 1, reciprocalRank: 0.5, refused: false, grounded: 0.7, answer: "y" },
    { id: "n1", type: "negative", question: "", retrievedDocIds: [], recall: 0, reciprocalRank: 0, refused: true, grounded: null, answer: "not found" },
  ];

  it("computes aggregate metrics over the right subsets", () => {
    const card = aggregate(cases);
    expect(card.recall_at_k).toBe(1);
    expect(card.mrr).toBeCloseTo(0.75);
    expect(card.faithfulness).toBeCloseTo(0.8);
    expect(card.refusal_accuracy).toBe(1);
    expect(card.answer_rate).toBe(1);
    expect(card.counts).toEqual({ total: 3, positive: 2, negative: 1, answered: 2 });
  });

  it("mean of empty list is 0", () => {
    expect(mean([])).toBe(0);
  });
});
