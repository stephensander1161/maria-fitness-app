import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { facts, factViews, type Fact } from "@/lib/db/schema";
import { today, type ISODate } from "@/lib/date";
import { preferredTopic, type FactTopic } from "@/lib/fact-timing";

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
  /** A subject to prefer — sleep, late at night. Falls back to the whole
   *  pool once every fact on the subject has been seen. */
  topic?: FactTopic,
): Promise<PickedFact | null> {
  const seen = db.select({ id: factViews.factId }).from(factViews)
    .where(eq(factViews.profileId, profileId));

  const filters = [notInArray(facts.id, seen)];
  if (category) filters.push(eq(facts.category, category));
  const onTopic = topic ? [eq(facts.topic, topic)] : [];

  let [row] = await db.select().from(facts).where(and(...filters, ...onTopic))
    .orderBy(sql`random()`).limit(1);

  // Every fact seen at least once — start recycling rather than going silent.
  // A preferred topic recycles its own before widening: at eleven at night a
  // sleep fact she has read beats a strength fact she has not.
  if (!row && topic) {
    [row] = await db.select().from(facts)
      .where(and(...(category ? [eq(facts.category, category)] : []), ...onTopic))
      .orderBy(sql`random()`).limit(1);
    if (row) return { category: row.category, text: row.text, source: row.source };
  }
  if (!row) {
    [row] = await db.select().from(facts).where(and(...filters))
      .orderBy(sql`random()`).limit(1);
  }
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
 * A different one on every screen, without burning the library.
 *
 * It used to be one a day, which made the card furniture — the same sentence
 * under every screen from breakfast to bedtime, and by the second look she
 * had stopped reading it. Now it turns over as she moves around.
 *
 * The compromise that makes that affordable: the pool it draws from is the
 * ones she has *already been shown*, plus one genuinely new one each day. So
 * a day of heavy use re-reads rather than burning through a year of material
 * in an afternoon, and the seen-tracking still means the coach never quotes
 * her something she read ten seconds ago.
 */
export async function factForDay(
  profileId: string,
  asOf: ISODate,
  /** The hour where she is. After ten, most picks are about sleep. */
  hour: number,
): Promise<PickedFact | null> {
  const topic = preferredTopic(hour, Math.random());
  if (topic) return pickUnseenFact(profileId, asOf, undefined, topic);

  const shownToday = await db
    .select({ id: factViews.factId })
    .from(factViews)
    .where(and(eq(factViews.profileId, profileId), eq(factViews.shownOn, asOf)))
    .limit(1);

  // The day's new one, drawn and recorded once.
  if (shownToday.length === 0) return pickUnseenFact(profileId, asOf);

  // After that, anything she has seen before — at random, and not the one
  // still on the screen she is leaving.
  const [row] = await db
    .select({ category: facts.category, text: facts.text, source: facts.source })
    .from(factViews)
    .innerJoin(facts, eq(factViews.factId, facts.id))
    .where(eq(factViews.profileId, profileId))
    .orderBy(sql`random()`)
    .limit(1);
  return row ?? null;
}
