// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L8 · THE EVAL DATA MODEL (ground truth in, scorecard out)
//
// EvalCase is one labeled row from dataset.jsonl: a question + the expected
// supporting doc id(s) + a type. POSITIVE = answerable from the corpus (right doc
// must be retrieved, answer given). NEGATIVE = out-of-corpus (the system MUST
// refuse). Without negatives you cannot measure refusal — so they're a deliberate,
// first-class part of the set. `expected_sources` are docIds like "zerodha/gtt",
// which is exactly what loadCorpusDir derives from the file path (L5).
// ═══════════════════════════════════════════════════════════════════════════

/** One labeled evaluation case from evals/dataset.jsonl. */
export interface EvalCase {
  id: string;
  question: string;
  /** Expected supporting document ids (e.g. "zerodha/gtt"). Empty for negatives. */
  expected_sources: string[];
  /** Optional reference answer (documentation only; metrics don't string-match it). */
  expected_answer?: string;
  /** "positive" => answerable from corpus; "negative" => out-of-corpus, must refuse. */
  type: "positive" | "negative";
}

/** Per-case outcome captured by the runner. */
export interface CaseResult {
  id: string;
  type: EvalCase["type"];
  question: string;
  retrievedDocIds: string[];
  recall: number;
  reciprocalRank: number;
  refused: boolean;
  /** Groundedness in [0,1] for answered positive cases; null otherwise. */
  grounded: number | null;
  answer: string;
}

/** Aggregate scorecard across all cases. */
export interface Scorecard {
  recall_at_k: number;
  mrr: number;
  faithfulness: number;
  refusal_accuracy: number;
  answer_rate: number;
  counts: { total: number; positive: number; negative: number; answered: number };
}

/** Thresholds for the regression gate (evals/baseline.json). */
export interface Baseline {
  k: number;
  thresholds: {
    recall_at_k: number;
    mrr: number;
    faithfulness: number;
    refusal_accuracy: number;
  };
  /** Allowed slack so floating-point jitter doesn't flip the gate. */
  epsilon: number;
}
