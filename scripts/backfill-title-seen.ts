import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { RANKS, scoreFor } from "@/lib/titles";
import { titleStatsRaw } from "@/lib/views";
import { profileToday } from "@/lib/profile";

/**
 * Stamp everybody's current rank, once.
 *
 * The new-title screen fires when the rank passes what she has already been
 * shown. Null means "never shown", and without this every existing account
 * would be handed a celebration for a title it had held for months — which
 * is the fastest possible way to teach people that the screen means nothing.
 *
 * Safe to re-run: it only touches rows that are still null.
 */
async function main() {
  const rows = await db.select().from(profiles).where(isNull(profiles.titleSeenAt));
  console.log(`${rows.length} profile(s) to stamp`);
  for (const p of rows) {
    const stats = await titleStatsRaw(p.id, profileToday(p));
    const score = scoreFor(stats);
    let i = 0;
    while (i + 1 < RANKS.length && score >= RANKS[i + 1].at) i += 1;
    await db.update(profiles).set({ titleSeenAt: RANKS[i].at }).where(eq(profiles.id, p.id));
    console.log(`  ${p.name ?? p.id}: ${RANKS[i].name} (${RANKS[i].at})`);
  }
  process.exit(0);
}
void main();
