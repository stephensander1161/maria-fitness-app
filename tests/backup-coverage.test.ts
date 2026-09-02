import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import * as schema from "@/lib/db/schema";

/**
 * A backup that quietly skips a table is worse than no backup, because it is
 * believed. Both scripts name their tables in a literal list, which is exactly
 * the kind of list a new feature forgets — so the list is checked against the
 * schema rather than trusted.
 */

const isTable = (name: string) => {
  const t = (schema as Record<string, unknown>)[name];
  return t !== null && typeof t === "object" && "getSQL" in (t as object);
};

// Seeded from source, so restoring them from a backup would only bloat it.
const REFERENCE = new Set([
  "exercises", "facts", "foods",
  "workoutTemplates", "workoutTemplateDays", "workoutTemplateExercises",
  "mealTemplates", "mealTemplateItems",
]);

// Deliberately not in a backup: accounts and credentials are managed by
// `npm run user`, the audit log survives a restore on purpose, and rate-limit
// events are ephemeral.
const EXCLUDED = new Set(["users", "auditLog", "rateEvents"]);

suite("her data is in the backup", () => {
  const tables = Object.keys(schema).filter(isTable)
    .filter((t) => !REFERENCE.has(t) && !EXCLUDED.has(t));

  for (const file of ["scripts/backup.ts", "scripts/restore.ts"]) {
    it(`${file} names every table that holds her data`, () => {
      const src = fs.readFileSync(file, "utf8");
      const from = src.indexOf("const TABLES");
      const to = src.indexOf("}", from);
      // Both bounds asserted: `indexOf(...) + 1 || undefined` sliced to the end
      // of the file when the marker was missing, so every table "matched" and
      // the recovery control's test could never fail.
      expect(from, `${file} has no TABLES list`).toBeGreaterThan(-1);
      expect(to, `${file}'s TABLES list is unterminated`).toBeGreaterThan(from);
      const list = src.slice(from, to);
      const missing = tables.filter((t) => !new RegExp(`\\b${t}\\b`).test(list));
      expect(
        missing,
        `a new table is not being backed up: ${missing.join(", ")}`,
      ).toEqual([]);
    });
  }
});
