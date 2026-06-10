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
  if (body.length <= opts.maxChars) return [body];

  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const windows: string[] = [];
  let current = "";

  for (const para of paras) {
    if (current.length > 0 && current.length + para.length + 2 > opts.maxChars) {
      windows.push(current);
      // Carry an overlap tail into the next window for context continuity.
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
