import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Two suites, and the split is the point.
 *
 * `tests/**` is pure logic: no database, no API key, no network. CI runs it on
 * every push, which is only possible because it needs nothing — and the job
 * proves it stays that way. That is the suite that must never grow a secret.
 *
 * `tests/db/**` is the other half, and it exists because the first one had
 * nowhere to put two thirds of this app. Every tool handler, every read model
 * and every screen query is a database query, so they sat at eight per cent
 * covered while `lib/` proper sat at a hundred — and the thing that actually
 * breaks her app is a query, not an arithmetic helper. These run against a
 * real Postgres, and they follow the probe rule from CLAUDE.md to the letter:
 * every one creates its own throwaway account, writes only to that account's
 * rows, and deletes it in a `finally`. See tests/db/account.ts.
 *
 * `npm test` is the pure suite. `npm run test:db` is the other. `npm run
 * test:all` is both, and is what `npm run ship` gates on — because the
 * deploy happens from a machine that has the credential, and the credential
 * is the only reason CI cannot do this itself.
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/db/**"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/db/setup.ts"],
          // One account per file, created and dropped around it, and several
          // files sharing a Neon connection pool is how a run ends in
          // "too many connections". They are cheap; they do not need to race.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["lib/**", "components/**", "app/**"],
      exclude: [
        // Data, not logic: the exercise library, the food table, the
        // templates. Thousands of lines of literals that a test can only
        // restate. `tests/exercises.test.ts` checks their *shape*, which is
        // the part that can be wrong.
        "lib/seed/**",
        // Generated, or a re-export of it.
        "lib/db/schema.ts",
        "**/*.d.ts",
      ],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
