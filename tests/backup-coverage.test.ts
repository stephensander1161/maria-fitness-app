import { describe as suite, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { BACKUP_TABLES } from "@/lib/backup";

/**
 * A backup that quietly skips a table is worse than no backup, because it is
 * believed. The dump names its tables in a literal list, which is exactly the
 * kind of list a new feature forgets — so the list is checked against the
 * schema rather than trusted, and the restore script imports the same list
 * (tests/backup-cron.test.ts) so there is no second copy to forget.
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
// `npm run user`, the audit log survives a restore on purpose, rate-limit
// events are ephemeral, and the error log is about the app rather than her.
const EXCLUDED = new Set(["users", "auditLog", "rateEvents", "appErrors"]);

suite("her data is in the backup", () => {
  const tables = Object.keys(schema).filter(isTable)
    .filter((t) => !REFERENCE.has(t) && !EXCLUDED.has(t));

  it("the dump names every table that holds her data", () => {
    const dumped = new Set(Object.keys(BACKUP_TABLES));
    const missing = tables.filter((t) => !dumped.has(t));
    expect(missing, `a new table is not being backed up: ${missing.join(", ")}`).toEqual([]);
  });

  it("and each name is the table it says it is", () => {
    // A key pointing at the wrong table would dump one table twice under two
    // names and the other not at all, and the count above would still pass.
    for (const [name, table] of Object.entries(BACKUP_TABLES)) {
      expect(table, name).toBe((schema as Record<string, unknown>)[name]);
    }
  });
});
