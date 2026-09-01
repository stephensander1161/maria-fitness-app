import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Pure-logic unit tests only. Anything needing the database or the
    // Anthropic API belongs in evals/, which is a separate, paid run.
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
