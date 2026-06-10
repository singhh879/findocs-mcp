import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Model load + DB round-trips can be slow on a cold cache.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
