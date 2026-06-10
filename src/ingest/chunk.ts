// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L5 · CHUNKING — why & how documents get split
//
// You don't embed a whole 5-page document as ONE vector. Two reasons:
//   • Retrieval precision — one vector for a long doc averages many topics into a
//     blurry point. Smaller chunks each capture one idea, so the right *passage*
//     can rank highly for a specific question.
//   • Grounding precision — the answer cites the chunk it used; smaller chunks =
//     tighter, checkable citations and less irrelevant text fed to synthesis.
// But too small loses the context that makes a chunk meaningful. Chunking is a
// precision/context tradeoff; the unit of that tradeoff is SIZE + BOUNDARIES.
//
// GOOD BOUNDARIES: don't cut every N characters (that slices sentences/headings in
// half). Split on document STRUCTURE (headings) first, then only window oversized
// sections, with a small OVERLAP so a fact straddling a boundary still appears whole
// in at least one chunk.
//
// DETERMINISM: this is a PURE function — same input → same chunks, every run. That
// reproducibility is what makes retrieval evals comparable run to run, and it's what
// lets ingest/pipeline.ts derive stable content-hash ids.
//
// Down the ladder ▼  next: src/ingest/pipeline.ts (chunk → embed → upsert).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Heading- and size-aware markdown chunking.
 *
 * Pure and deterministic: same input => same chunks (and therefore same chunk
 * ids downstream). This determinism is what makes retrieval evals reproducible.
 */

export interface RawChunk {
  /** Nearest heading text, used as the chunk title. */
  title: string;
  /** Chunk body text. */
  content: string;
}

export interface ChunkOptions {
  /** Soft max chunk size in characters. */
  maxChars: number;
  /** Overlap (characters) between adjacent windows of an oversized section. */
  overlap: number;
}

// LEARN: these defaults are a retrieval-quality LEVER. Shrink maxChars and recall/MRR
// (measured in evals/) shift — sometimes up (precision), sometimes down (lost
// context). Tuning them is a measurable experiment, not a guess.
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxChars: 1200,
  overlap: 150,
};

interface Section {
  heading: string;
  body: string;
}

/** Split markdown into sections keyed by ATX headings (`#`..`######`). */
function splitSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  let heading = "";
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    if (body.length > 0) sections.push({ heading, body });
    buf = [];
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      // LEARN: a heading line both ENDS the previous section and names the next —
      // so each chunk inherits its nearest heading as a human-readable title.
      flush();
      heading = (m[2] ?? "").trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Break an oversized body into overlapping windows, preferring paragraph
 * boundaries so we don't slice mid-sentence when we can avoid it.
 */
function windowBody(body: string, opts: ChunkOptions): string[] {
  // LEARN: small section → one chunk, untouched. We only pay the windowing cost when
  // a section actually exceeds the size budget.
  if (body.length <= opts.maxChars) return [body];

  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const windows: string[] = [];
  let current = "";

  for (const para of paras) {
    if (current.length > 0 && current.length + para.length + 2 > opts.maxChars) {
      windows.push(current);
      // LEARN: carry an OVERLAP tail into the next window so context that spans the
      // cut isn't lost — the boundary fact lives, intact, in both neighbours.
      const tail = current.slice(Math.max(0, current.length - opts.overlap));
      current = `${tail}\n\n${para}`;
    } else {
      current = current.length > 0 ? `${current}\n\n${para}` : para;
    }
    // A single paragraph larger than maxChars: hard-split it.
    while (current.length > opts.maxChars) {
      windows.push(current.slice(0, opts.maxChars));
      current = current.slice(opts.maxChars - opts.overlap);
    }
  }
  if (current.trim().length > 0) windows.push(current);
  return windows;
}

/**
 * Chunk a markdown document into titled, bounded pieces.
 * The first `# Title` (if present) seeds the default title for untitled preamble.
 */
export function chunkMarkdown(
  markdown: string,
  options: Partial<ChunkOptions> = {},
): RawChunk[] {
  const opts: ChunkOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const sections = splitSections(markdown);
  const chunks: RawChunk[] = [];

  for (const section of sections) {
    const title = section.heading.length > 0 ? section.heading : "Untitled";
    for (const window of windowBody(section.body, opts)) {
      const content = window.trim();
      if (content.length > 0) chunks.push({ title, content });
    }
  }
  return chunks;
}
