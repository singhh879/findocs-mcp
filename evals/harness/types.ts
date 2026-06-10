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
