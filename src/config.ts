// ═══════════════════════════════════════════════════════════════════════════
// LEARN ▼  L10 · BOUNDARIES — parse & validate, then trust the inside
//
// A recurring architecture rule: untyped data from the outside world (env vars,
// JSON files, DB rows) is VALIDATED at the edge, so the interior of the program is
// fully typed and can be trusted. Here, every environment variable runs through a
// zod schema with defaults + ranges, and a bad value throws a READABLE error and
// fails fast (never run on bad config). The eval runner does the same for
// dataset.jsonl / baseline.json. This is why you see no `process.env.X!` scattered
// around and no `any` in the core.
//
// Notice the knobs that tune behavior live here as validated numbers:
// SEARCH_TOP_K and the two refusal-gate floors (ANSWER_MIN_*_SIMILARITY).
// ═══════════════════════════════════════════════════════════════════════════
import { z } from "zod";

/**
 * Centralized, validated runtime configuration.
 *
 * Every environment boundary is parsed through zod so the rest of the codebase
 * works with strongly-typed, already-validated values — no `any`, no ad-hoc
 * `process.env.X!` reads scattered around.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://findocs:findocs@localhost:5433/findocs"),

  // LEARN: the enum is the SINGLE source of truth for valid providers. Add a value
  // here and the exhaustive switch in the matching factory won't compile until you
  // handle it (see embeddings/index.ts, llm/index.ts).
  EMBEDDINGS_PROVIDER: z.enum(["local"]).default("local"),
  EMBEDDINGS_MODEL: z.string().min(1).default("Xenova/all-MiniLM-L6-v2"),

  LLM_PROVIDER: z.enum(["heuristic", "ollama"]).default("heuristic"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2"),

  // LEARN: z.coerce turns the env STRING "5" into the number 5; .max/.min validate
  // the range. The refusal floors below are the gate's tunable knobs (see qa/gate.ts).
  SEARCH_TOP_K: z.coerce.number().int().positive().max(50).default(5),
  ANSWER_MIN_TOP_SIMILARITY: z.coerce.number().min(0).max(1).default(0.35),
  ANSWER_MIN_MEAN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.28),
});

export type AppConfig = Readonly<z.infer<typeof EnvSchema>>;

let cached: AppConfig | null = null;

/**
 * Parse and cache config from `process.env`. Throws a readable error if the
 * environment is misconfigured (fail fast, never run on bad config).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // LEARN: turn zod's structured issues into a human-readable, multi-line error —
    // a misconfigured deploy gets told exactly which var is wrong, immediately.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

/** Test-only hook to reset the memoized config. */
export function resetConfigForTests(): void {
  cached = null;
}
