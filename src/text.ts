/**
 * Small, dependency-free text utilities shared by the heuristic LLM provider and
 * the eval harness. Pure and deterministic so they can be unit-tested directly.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are",
  "be", "with", "as", "by", "at", "from", "that", "this", "it", "you", "your",
  "can", "will", "how", "what", "do", "does", "i", "we", "if", "not", "but",
  "they", "them", "their", "has", "have", "was", "were", "which", "use", "used",
]);

/** Lowercase word tokens, stripped of punctuation. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((t) => t.length > 0);
}

/** Content tokens: tokens minus stopwords, used for overlap scoring. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

/** Split text into sentences on terminal punctuation / newlines. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Jaccard similarity between two token sets. */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Coverage of `target` content tokens by `source` content tokens (0..1).
 * Asymmetric: "how much of the target is supported by the source".
 */
export function coverage(target: Iterable<string>, source: Iterable<string>): number {
  const t = new Set(target);
  if (t.size === 0) return 0;
  const s = new Set(source);
  let covered = 0;
  for (const tok of t) if (s.has(tok)) covered++;
  return covered / t.size;
}
