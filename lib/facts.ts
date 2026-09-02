import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { facts, factViews, type Fact } from "@/lib/db/schema";
import { today, type ISODate } from "@/lib/date";

export type FactCategory = Fact["category"];
export type PickedFact = { category: FactCategory; text: string; source: string | null };

/**
 * A fact she hasn't seen, recorded so it isn't repeated. Shared by the coach's
 * get_fact tool and the boost screen — two surfaces drawing from one pool, so
 * the coach can't quote back something she read ten seconds ago.
 */
export async function pickUnseenFact(
  profileId: string,
  /** Her today. A fact marked seen "tomorrow" is one she never gets again. */
  asOf: ISODate = today(),
  category?: FactCategory,
): Promise<PickedFact | null> {
  const seen = db.select({ id: factViews.factId }).from(factViews)
    .where(eq(factViews.profileId, profileId));

  const filters = [notInArray(facts.id, seen)];
  if (category) filters.push(eq(facts.category, category));

  let [row] = await db.select().from(facts).where(and(...filters))
    .orderBy(sql`random()`).limit(1);

  // Every fact seen at least once — start recycling rather than going silent.
  if (!row) {
    [row] = await db.select().from(facts)
      .where(category ? eq(facts.category, category) : undefined)
      .orderBy(sql`random()`).limit(1);
    if (!row) return null;
  }

  await db.insert(factViews).values({ profileId, factId: row.id, shownOn: asOf });
  return { category: row.category, text: row.text, source: row.source };
}

/**
 * Today's fact, and the same one all day.
 *
 * The card sits at the bottom of every screen, so this has to be idempotent:
 * picking a new one per render would burn the whole library in an afternoon
 * and mark every one of them seen, which is the one thing the seen-tracking
 * exists to prevent. One a day, recorded once, returned unchanged until
 * tomorrow.
 */
export async function factForDay(profileId: string, asOf: ISODate): Promise<PickedFact | null> {
  const [already] = await db
    .select({ category: facts.category, text: facts.text, source: facts.source })
    .from(factViews)
    .innerJoin(facts, eq(factViews.factId, facts.id))
    .where(and(eq(factViews.profileId, profileId), eq(factViews.shownOn, asOf)))
    .limit(1);
  if (already) return already;

  return pickUnseenFact(profileId, asOf);
}
