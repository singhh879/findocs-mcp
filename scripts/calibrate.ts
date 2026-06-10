/**
 * Offline eval / calibration utility — NO database required.
 *
 * Cosine ranking is identical whether vectors live in pgvector or in memory, so
 * this reuses the real embedder and the exact scoring modules (gate, metrics,
 * heuristic judge) to (a) smoke-test retrieval quality and (b) calibrate
 * evals/baseline.json. The production/CI eval (`pnpm eval`) runs the same logic
 * against the real pgvector store.
 *
 * Usage: pnpm exec tsx scripts/calibrate.ts
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

import { loadConfig } from "../src/config.js";
import { getEmbedder } from "../src/embeddings/index.js";
import { chunkMarkdown } from "../src/ingest/chunk.js";
import { loadCorpusDir } from "../src/ingest/load.js";
import { evaluateConfidence } from "../src/qa/gate.js";
import { HeuristicProvider } from "../src/llm/heuristic.js";
import type { RetrievedContext } from "../src/llm/types.js";
import { aggregate, recallAtK, reciprocalRank } from "../evals/harness/metrics.js";
import { formatScorecard } from "../evals/harness/scorecard.js";
import type { CaseResult } from "../evals/harness/types.js";

const EvalCaseSchema = z.object({
  id: z.string(),
  question: z.string(),
  expected_sources: z.array(z.string()).default([]),
  expected_answer: z.string().optional(),
  type: z.enum(["positive", "negative"]),
});

interface IndexedChunk {
  docId: string;
  source: string;
  title: string;
  content: string;
  embedding: number[];
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..");
  const cfg = loadConfig();
  const k = cfg.SEARCH_TOP_K;
  const embedder = getEmbedder();
  const llm = new HeuristicProvider();

  // Build the in-memory index from the corpus.
  const docs = await loadCorpusDir(join(root, "corpus"));
  const index: IndexedChunk[] = [];
  for (const doc of docs) {
    const raw = chunkMarkdown(doc.markdown);
    const vecs = await embedder.embed(raw.map((c) => c.content));
    raw.forEach((c, i) => {
      index.push({
        docId: doc.docId,
        source: doc.source,
        title: c.title || doc.title,
        content: c.content,
        embedding: vecs[i] ?? [],
      });
    });
  }
  console.log(`indexed ${index.length} chunks from ${docs.length} docs\n`);

  // Load the dataset.
  const datasetRaw = await readFile(join(root, "evals", "dataset.jsonl"), "utf8");
  const cases = datasetRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => EvalCaseSchema.parse(JSON.parse(l)));

  const results: CaseResult[] = [];
  const posTop: number[] = [];
  const negTop: number[] = [];

  for (const c of cases) {
    const [qv] = await embedder.embed([c.question]);
    const scored = index
      .map((ch) => ({ ch, score: dot(qv ?? [], ch.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    const retrievedDocIds = scored.map((s) => s.ch.docId);
    const gate = evaluateConfidence(scored.map((s) => s.score), {
      minTopSimilarity: cfg.ANSWER_MIN_TOP_SIMILARITY,
      minMeanSimilarity: cfg.ANSWER_MIN_MEAN_SIMILARITY,
    });
    (c.type === "positive" ? posTop : negTop).push(gate.topSimilarity);

    let grounded: number | null = null;
    if (c.type === "positive" && gate.pass) {
      const contexts: RetrievedContext[] = scored.map((s) => ({
        id: s.ch.docId,
        title: s.ch.title,
        source: s.ch.source,
        content: s.ch.content,
        score: s.score,
      }));
      const answer = await llm.synthesize(c.question, contexts);
      grounded = (await llm.judge(answer, contexts)).grounded;
    }

    const refused = !gate.pass;
    const recall = recallAtK(retrievedDocIds, c.expected_sources, k);
    results.push({
      id: c.id,
      type: c.type,
      question: c.question,
      retrievedDocIds,
      recall,
      reciprocalRank: reciprocalRank(retrievedDocIds, c.expected_sources),
      refused,
      grounded,
      answer: "",
    });

    // Surface misses for tuning.
    if (c.type === "positive" && recall === 0) {
      console.log(`MISS  ${c.id}: expected ${c.expected_sources.join(",")} got ${retrievedDocIds.slice(0, 3).join(",")}`);
    }
    if (c.type === "negative" && !refused) {
      console.log(`LEAK  ${c.id}: answered (top=${gate.topSimilarity.toFixed(3)}) "${c.question}"`);
    }
  }

  const card = aggregate(results);
  console.log("\n" + formatScorecard(card, { embedderId: embedder.id, llmId: llm.id, k }));

  const stat = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
    return `min=${q(0).toFixed(3)} p50=${q(0.5).toFixed(3)} max=${q(0.999).toFixed(3)}`;
  };
  console.log(`\npositive top-sim:  ${stat(posTop)}`);
  console.log(`negative top-sim:  ${stat(negTop)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
