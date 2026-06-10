import { describe, it, expect } from "vitest";
import { tokenize, contentTokens, splitSentences, jaccard, coverage } from "../src/text.js";

describe("text utilities", () => {
  it("tokenizes lowercased alphanumerics", () => {
    expect(tokenize("Hello, World! API_v3")).toEqual(["hello", "world", "api_v3"]);
  });

  it("removes stopwords for content tokens", () => {
    expect(contentTokens("the order is a market order")).toEqual(["order", "market", "order"]);
  });

  it("splits sentences on terminal punctuation and newlines", () => {
    expect(splitSentences("One. Two!\nThree?")).toEqual(["One.", "Two!", "Three?"]);
  });

  it("computes jaccard similarity", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], ["a"])).toBe(0);
  });

  it("coverage is asymmetric support of target by source", () => {
    expect(coverage(["a", "b"], ["a", "b", "c"])).toBe(1);
    expect(coverage(["a", "x"], ["a"])).toBe(0.5);
    expect(coverage([], ["a"])).toBe(0);
  });
});
