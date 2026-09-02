/**
 * Restore a backup produced by scripts/backup.ts.
 *
 *   npm run restore -- backups/coach-20260831T2200.json
 *
 * Replaces her data wholesale: every table in the file is emptied and refilled,
 * ids preserved so foreign keys still line up. Reference data is untouched, so
 * run db:seed if the exercise or fact libraries have moved on.
 */
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  complaints, cycleEvents, factViews, feedback, goals, mealLogs, mealPlans, meals, measurements, messages,
  pantryItems, photos, planDays, planExercises, plans, profiles, setLogs, shoppingExtras,
  usageDaily, weighIns, workouts,
} from "@/lib/db/schema";

// Same order as backup.ts: parents before children.
const TABLES = {
  profiles, weighIns, measurements, goals, photos, complaints, cycleEvents,
  plans, planDays, planExercises,
  workouts, setLogs,
  mealPlans, meals, mealLogs, pantryItems, shoppingExtras,
  messages, feedback, factViews, usageDaily,
};

const ORDER = Object.keys(TABLES) as (keyof typeof TABLES)[];

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run restore -- <backup.json>");

  const backup = JSON.parse(fs.readFileSync(file, "utf8")) as {
    takenAt: string;
    tables: Record<string, Record<string, unknown>[]>;
  };
  console.log(`  restoring backup from ${backup.takenAt}\n`);

  // Children first when clearing, parents first when inserting.
  for (const name of [...ORDER].reverse()) {
    await db.delete(TABLES[name]);
  }

  for (const name of ORDER) {
    const rows = backup.tables[name] ?? [];
    if (rows.length === 0) { console.log(`  ${name.padEnd(16)}     0`); continue; }

    // Timestamps come back from JSON as strings; Drizzle wants Date objects.
    const revived = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) =>
          typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) ? [k, new Date(v)] : [k, v],
        ),
      ),
    );
    await db.insert(TABLES[name]).values(revived as never);
    console.log(`  ${name.padEnd(16)} ${String(rows.length).padStart(5)}`);
  }

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(profiles);
  await audit("data.restored");
  console.log(`\n✓ restored — ${n} profile(s)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
