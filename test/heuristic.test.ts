import { describe, it, expect } from "vitest";
import { HeuristicProvider, judgeGroundedness } from "../src/llm/heuristic.js";
import type { RetrievedContext } from "../src/llm/types.js";

const ctx = (id: string, content: string, score = 0.6): RetrievedContext => ({
  id,
  title: id,
  source: "test",
  content,
  score,
});

describe("HeuristicProvider.synthesize", () => {
  it("extracts the most relevant sentence and cites its context", async () => {
    const provider = new HeuristicProvider();
    const contexts = [
      ctx("1", "A GTT is valid for up to 365 days from creation. It runs on the server."),
      ctx("2", "Market orders execute at the best available price."),
    ];
    const answer = await provider.synthesize("How long is a GTT valid?", contexts);
    expect(answer).toMatch(/365 days/);
    expect(answer).toMatch(/\[1\]/);
  });

  it("is deterministic", async () => {
    const provider = new HeuristicProvider();
    const contexts = [ctx("1", "IOC cancels any unfilled portion immediately.")];
    const a = await provider.synthesize("What does IOC do?", contexts);
    const b = await provider.synthesize("What does IOC do?", contexts);
    expect(a).toBe(b);
  });
});

describe("judgeGroundedness", () => {
  it("scores a supported answer highly", () => {
    const contexts = [ctx("1", "The access token is valid only for the trading day and expires the next morning.")];
    const result = judgeGroundedness("The access token is valid only for the trading day.", contexts);
    expect(result.grounded).toBeGreaterThanOrEqual(0.5);
  });

  it("scores an unsupported answer low", () => {
    const contexts = [ctx("1", "Market depth shows five levels of bids and offers.")];
    const result = judgeGroundedness("Bananas are a good source of potassium for athletes.", contexts);
    expect(result.grounded).toBeLessThan(0.5);
  });

  it("returns 0 with no contexts", () => {
    expect(judgeGroundedness("anything", []).grounded).toBe(0);
  });
});
