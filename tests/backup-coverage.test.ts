import { describe as suite, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import fs from "node:fs";
import { BACKUP_SCHEMA_VERSION, BACKUP_TABLES } from "@/lib/backup";

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

// Reference data used to be left out as "seeded from source". The first
// restore drill (2026-09-18) showed that a seed hands out fresh ids, so a plan
// restored into a freshly seeded database points at exercises it never had.
// Everything travels now; nothing is skipped as reference.
const REFERENCE = new Set<string>();

// Deliberately not in a backup: the audit log survives a restore on purpose,
// rate-limit events are ephemeral, and the error log is about the app rather
// than her. Accounts *are* in — see the next suite for what is left out of them.
const EXCLUDED = new Set(["auditLog", "rateEvents", "appErrors"]);

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

suite("accounts travel, credentials do not", () => {
  /*
    2026-09-18, the first restore drill into an empty Neon branch: the dump had
    no `users`, on the theory that accounts could be re-created by hand. A
    re-created account has a new id, every profile points at the old one, and
    the restore died on the first foreign key. So the rows are in, and the one
    column that would make the file a credential is blanked before it leaves.
  */
  const src = fs.readFileSync("lib/backup.ts", "utf8");

  it("users comes before profiles, because profiles point at it", () => {
    const order = Object.keys(BACKUP_TABLES);
    expect(order.indexOf("users")).toBeLessThan(order.indexOf("profiles"));
  });

  it("the password hash is blanked in the dump, and only for users", () => {
    expect(src).toMatch(/name === "users"\s*\?\s*data\.map\(\(row\) => \(\{ \.\.\.row, passwordHash: null \}\)\)/);
  });

  it("the file says which shape it is", () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(2);
  });
});

suite("reference data travels with the rows that point at it", () => {
  it("comes first, so restore can insert it before anything points at it", () => {
    const order = Object.keys(BACKUP_TABLES);
    for (const ref of ["exercises", "facts", "foods", "workoutTemplates", "mealTemplates"]) {
      expect(order.indexOf(ref), ref).toBeLessThan(order.indexOf("users"));
    }
    expect(order.indexOf("workoutTemplateExercises")).toBeGreaterThan(order.indexOf("exercises"));
    expect(order.indexOf("mealTemplateItems")).toBeGreaterThan(order.indexOf("mealTemplates"));
  });
});
