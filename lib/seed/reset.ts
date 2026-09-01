/**
 * Wipes every profile-scoped row — conversation, plans, logs, goals — while
 * leaving the exercise and fact libraries intact. Use it to hand her a genuinely
 * clean app after testing. Run: npm run db:reset
 */
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  factViews, goals, mealLogs, mealPlans, measurements, messages, plans, profiles,
  setLogs, weighIns, workouts,
} from "@/lib/db/schema";

async function main() {
  // Refuse to run blind. This wipes every workout, weigh-in and conversation.
  if (!process.argv.includes("--yes")) {
    console.error(
      "This deletes ALL of her data: workouts, sets, weigh-ins, measurements,\n" +
      "photos, plans, meals and the entire coach conversation.\n\n" +
      "Take a backup first:  npm run backup\n" +
      "Then, to confirm:     npm run db:reset -- --yes",
    );
    process.exit(1);
  }

  // Order matters only where cascades don't cover it; profiles cascades the rest.
  await db.delete(setLogs);
  await db.delete(workouts);
  await db.delete(plans);
  await db.delete(mealLogs);
  await db.delete(mealPlans);
  await db.delete(weighIns);
  await db.delete(measurements);
  await db.delete(goals);
  await db.delete(factViews);
  await db.delete(messages);
  await db.delete(profiles);
  // Recorded after the wipe: the audit log deliberately survives a reset.
  await audit("data.deleted", { detail: { scope: "all profile data" } });
  console.log("✓ profile data cleared — exercise and fact libraries kept");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
