/**
 * Dump everything of hers to a JSON file.
 *
 *   npm run backup            -> backups/coach-YYYY-MM-DD-HHmm.json
 *   npm run backup -- path.json
 *
 * Neon's free tier has no point-in-time recovery, so a bad migration, a wrong
 * DELETE, or an accidental db:reset is unrecoverable. Months of her training
 * history is not something to hold in one place.
 *
 * Reference data (exercises, facts) is deliberately excluded — it is seeded from
 * source and would only bloat the file. Rate-limit events are ephemeral.
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  complaints, cycleEvents, factViews, feedback, goals, mealLogs, mealPlans, meals, measurements, messages,
  pantryItems, photos, planDays, planExercises, plans, profiles, setLogs, shoppingExtras,
  usageDaily, weighIns, workouts,
} from "@/lib/db/schema";

// Order matters for restore: parents before children.
const TABLES = {
  profiles, weighIns, measurements, goals, photos, complaints, cycleEvents,
  plans, planDays, planExercises,
  workouts, setLogs,
  mealPlans, meals, mealLogs, pantryItems, shoppingExtras,
  messages, feedback, factViews, usageDaily,
} as const;

async function main() {
  const out: Record<string, unknown[]> = {};
  let rows = 0;

  for (const [name, table] of Object.entries(TABLES)) {
    const data = await db.select().from(table);
    out[name] = data;
    rows += data.length;
    console.log(`  ${name.padEnd(16)} ${String(data.length).padStart(5)}`);
  }

  const stamp = new Date().toISOString().replace(/:/g, "").slice(0, 15);
  const target = process.argv[2] ?? path.join("backups", `coach-${stamp}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    JSON.stringify({ takenAt: new Date().toISOString(), schemaVersion: 1, tables: out }, null, 2),
  );

  const kb = Math.round(fs.statSync(target).size / 1024);
  await audit("data.exported");
  console.log(`\n✓ ${rows} rows -> ${target} (${kb}KB)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
