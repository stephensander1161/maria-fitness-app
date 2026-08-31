/**
 * Wipes every profile-scoped row — conversation, plans, logs, goals — while
 * leaving the exercise and fact libraries intact. Use it to hand her a genuinely
 * clean app after testing. Run: npm run db:reset
 */
import { db } from "@/lib/db";
import {
  factViews, goals, mealLogs, mealPlans, messages, plans, profiles, setLogs,
  weighIns, workouts,
} from "@/lib/db/schema";

async function main() {
  // Order matters only where cascades don't cover it; profiles cascades the rest.
  await db.delete(setLogs);
  await db.delete(workouts);
  await db.delete(plans);
  await db.delete(mealLogs);
  await db.delete(mealPlans);
  await db.delete(weighIns);
  await db.delete(goals);
  await db.delete(factViews);
  await db.delete(messages);
  await db.delete(profiles);
  console.log("✓ profile data cleared — exercise and fact libraries kept");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
