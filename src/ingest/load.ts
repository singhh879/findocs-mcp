import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** A logical document to be chunked and embedded. */
export interface SourceDocument {
  docId: string;
  source: string;
  title: string;
  url: string | null;
  markdown: string;
}

interface Frontmatter {
  source?: string;
  title?: string;
  url?: string;
  doc_id?: string;
}

/**
 * Minimal `key: value` frontmatter parser (no YAML dependency — the corpus uses
 * only flat string fields). Returns the parsed fields plus the remaining body.
 */
export function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const [, block = "", body = ""] = match;
  const data: Frontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = /^(\w+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1] as keyof Frontmatter;
    const value = (kv[2] ?? "").trim().replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return { data, body };
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdown(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

/** Load every `*.md` under `dir` as a SourceDocument, honoring frontmatter. */
export async function loadCorpusDir(dir: string): Promise<SourceDocument[]> {
  const files = (await walkMarkdown(dir)).sort();
  const docs: SourceDocument[] = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const relPath = relative(dir, file).replace(/\.md$/, "");
    const parts = relPath.split(sep);
    const docId = data.doc_id ?? relPath.split(sep).join("/");
    const source = data.source ?? parts[0] ?? "corpus";
    const title = data.title ?? deriveTitle(body) ?? docId;
    docs.push({
      docId,
      source,
      title,
      url: data.url ?? null,
      markdown: body,
    });
  }
  return docs;
}

/** Build a single document from raw text (used by `ingest_doc({ text })`). */
export function documentFromText(
  text: string,
  meta: {
    source?: string | undefined;
    title?: string | undefined;
    url?: string | undefined;
    docId?: string | undefined;
  } = {},
): SourceDocument {
  const title = meta.title ?? deriveTitle(text) ?? "Untitled";
  return {
    docId: meta.docId ?? `inline/${slugify(title)}`,
    source: meta.source ?? "inline",
    title,
    url: meta.url ?? null,
    markdown: text,
  };
}

/** Fetch a URL and build a document (used by `ingest_doc({ url })`). */
export async function documentFromUrl(url: string): Promise<SourceDocument> {
  const res = await fetch(url, { headers: { "user-agent": "findocs-mcp/0.1" } });
  if (!res.ok) throw new Error(`fetch failed (${res.status}) for ${url}`);
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  const markdown = contentType.includes("html") ? htmlToText(raw) : raw;
  return {
    docId: `url/${slugify(url)}`,
    source: "url",
    title: deriveTitle(markdown) ?? url,
    url,
    markdown,
  };
}

function deriveTitle(markdown: string): string | null {
  const h1 = /^#\s+(.+)$/m.exec(markdown);
  if (h1?.[1]) return h1[1].trim();
  const firstLine = markdown.split(/\r?\n/).find((l) => l.trim().length > 0);
  return firstLine ? firstLine.trim().slice(0, 120) : null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Crude HTML → text: drop scripts/styles/tags, collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
