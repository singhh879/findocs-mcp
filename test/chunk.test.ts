import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "../src/ingest/chunk.js";

describe("chunkMarkdown", () => {
  it("splits a document into sections keyed by headings", () => {
    const md = "# Title\n\nIntro paragraph.\n\n## Section A\n\nBody A.\n\n## Section B\n\nBody B.";
    const chunks = chunkMarkdown(md);
    const titles = chunks.map((c) => c.title);
    expect(titles).toContain("Title");
    expect(titles).toContain("Section A");
    expect(titles).toContain("Section B");
  });

  it("is deterministic — same input yields identical chunks", () => {
    const md = "## H\n\n" + "word ".repeat(50);
    expect(chunkMarkdown(md)).toEqual(chunkMarkdown(md));
  });

  it("windows oversized sections with overlap and respects maxChars", () => {
    const para = "Sentence number one is fairly long and descriptive.";
    const big = `## Big\n\n${Array.from({ length: 60 }, () => para).join("\n\n")}`;
    const chunks = chunkMarkdown(big, { maxChars: 400, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // allow a small slack for overlap/join boundaries
      expect(c.content.length).toBeLessThanOrEqual(400 + 60);
      expect(c.title).toBe("Big");
    }
  });

  it("drops empty content", () => {
    expect(chunkMarkdown("   \n\n   ")).toEqual([]);
  });
});
