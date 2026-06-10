// LEARN ▸ docs/learning/10-typescript-and-architecture.md — parse/validate the boundary, trust the inside
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

  EMBEDDINGS_PROVIDER: z.enum(["local"]).default("local"),
  EMBEDDINGS_MODEL: z.string().min(1).default("Xenova/all-MiniLM-L6-v2"),

  LLM_PROVIDER: z.enum(["heuristic", "ollama"]).default("heuristic"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2"),

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
