import { describe, it, expect, afterEach } from "vitest";
import { loadConfig, resetConfigForTests } from "../src/config.js";

afterEach(() => resetConfigForTests());

describe("loadConfig", () => {
  it("applies defaults for an empty environment", () => {
    const cfg = loadConfig({});
    expect(cfg.EMBEDDINGS_PROVIDER).toBe("local");
    expect(cfg.LLM_PROVIDER).toBe("heuristic");
    expect(cfg.SEARCH_TOP_K).toBe(5);
    expect(cfg.ANSWER_MIN_TOP_SIMILARITY).toBeCloseTo(0.35);
  });

  it("coerces numeric env vars", () => {
    resetConfigForTests();
    const cfg = loadConfig({ SEARCH_TOP_K: "8", ANSWER_MIN_TOP_SIMILARITY: "0.5" });
    expect(cfg.SEARCH_TOP_K).toBe(8);
    expect(cfg.ANSWER_MIN_TOP_SIMILARITY).toBe(0.5);
  });

  it("rejects an invalid provider", () => {
    resetConfigForTests();
    expect(() => loadConfig({ LLM_PROVIDER: "gpt5" })).toThrow(/Invalid configuration/);
  });

  it("rejects an out-of-range similarity floor", () => {
    resetConfigForTests();
    expect(() => loadConfig({ ANSWER_MIN_TOP_SIMILARITY: "2" })).toThrow();
  });
});
