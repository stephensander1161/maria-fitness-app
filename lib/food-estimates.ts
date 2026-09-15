import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodEstimates } from "@/lib/db/schema";

/**
 * What she logged, written back against the estimate she asked for.
 *
 * The recording half lives in `lib/tools/foods.ts`; this is the other half,
 * and it is the half that makes the table worth having. An estimate on its own
 * says what the app claimed. An estimate with the figure she actually filed
 * against it says whether the claim was any good — "we said 420, she logged
 * 650" is the row that improves the library, and nothing else in the app can
 * produce it.
 *
 * Matched on her exact wording, because the Eat calculator sends the very text
 * she then logs: she types the meal once, taps calculate, and submits. Anything
 * looser would attach a correction to the wrong prediction, and a wrong pairing
 * here is worse than a missing one — the whole point is to trust the gaps.
 *
 * Only the most recent unanswered estimate for that wording, and only within
 * the hour: logging the same meal again next Tuesday is a new occasion, not a
 * verdict on last week's guess.
 *
 * Best effort and never awaited by the caller: a record that fails to write
 * must not fail the meal she just logged.
 */
export async function noteWhatWasLogged(
  profileId: string,
  description: string,
  logged: {
    kcal: number | null; proteinG: number | null;
    carbsG: number | null; fatG: number | null;
  },
): Promise<boolean> {
  // Nothing to compare against. A meal logged with no figures says nothing
  // about whether the estimate was right — the same rule as everywhere else
  // in this app, where an unknown is never read as a zero.
  if (logged.kcal === null) return false;

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db.select({ id: foodEstimates.id })
    .from(foodEstimates)
    .where(and(
      eq(foodEstimates.profileId, profileId),
      eq(foodEstimates.query, description.slice(0, 500)),
      isNull(foodEstimates.loggedKcal),
      gte(foodEstimates.at, hourAgo),
    ))
    .orderBy(desc(foodEstimates.at))
    .limit(1);
  if (!recent) return false;

  await db.update(foodEstimates).set({
    loggedKcal: Math.round(logged.kcal),
    loggedProteinG: logged.proteinG === null ? null : Math.round(logged.proteinG),
    loggedCarbsG: logged.carbsG === null ? null : Math.round(logged.carbsG),
    loggedFatG: logged.fatG === null ? null : Math.round(logged.fatG),
  }).where(eq(foodEstimates.id, recent.id));
  return true;
}
