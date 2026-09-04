/**
 * Mark plan setup as done for anyone who onboarded before it was stamped.
 *
 *   npx tsx --env-file=.env scripts/backfill-plan-setup.ts        # dry run
 *   npx tsx --env-file=.env scripts/backfill-plan-setup.ts --yes
 *
 * First-run onboarding asks the same questions as run_plan_setup — days a
 * week, session length, equipment, injuries, food — and builds the week from
 * the answers. It just never recorded that it had, so the Train screen went on
 * inviting people to do the setup they had done a minute earlier.
 *
 * `update_profile` stamps it from now on. This is the same statement for rows
 * written before that, using each profile's own onboarding time rather than
 * now, so the record says when it actually happened. Idempotent: it only
 * touches rows where the stamp is missing.
 */
import { and, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

async function main() {
  const commit = process.argv.includes("--yes");
  const stale = and(isNotNull(profiles.onboardedAt), isNull(profiles.planSetupAt));

  const rows = await db
    .select({ id: profiles.id, name: profiles.name, onboardedAt: profiles.onboardedAt })
    .from(profiles).where(stale);

  console.log(`${rows.length} profile(s) onboarded without a plan-setup stamp:`);
  for (const r of rows) {
    console.log(`   ${r.id}  ${(r.name ?? "—").padEnd(16)} onboarded ${r.onboardedAt?.toISOString().slice(0, 16).replace("T", " ")}`);
  }
  if (!commit) { console.log("\n(dry run — pass --yes to write)"); process.exit(0); }
  if (rows.length === 0) { console.log("nothing to do"); process.exit(0); }

  // Its own onboarding time, not now: the stamp should say when the setup
  // actually happened.
  const updated = await db.update(profiles)
    .set({ planSetupAt: sql`${profiles.onboardedAt}` })
    .where(stale)
    .returning({ id: profiles.id });
  console.log(`\n✓ stamped ${updated.length} profile(s)`);
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
