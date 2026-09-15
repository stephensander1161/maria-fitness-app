import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { mealPlans } from "@/lib/db/schema";
import { weekStart, type ISODate } from "@/lib/date";

/**
 * The plan whose targets a given day is judged against.
 *
 * Four places asked for the meal plan row of `weekStart(date)` and nothing
 * else, so the first morning of a week nobody had planned yet had no calorie
 * target, no protein target, no carb or fat target — and a null target draws
 * no bar. Stephen opened Eat on the Monday, saw five hundred calories in the
 * totals with six empty meters under them, and nothing on the screen said
 * why. His last plan was the week before. One account had been like that for
 * a fortnight, and the coach was answering "you have no target set" in the
 * same breath as reporting her intake against one.
 *
 * A target set a week ago is still her target: what had not been written was
 * the *plan*, and the plan is meals. So this walks back from the date to the
 * most recent week she has one for.
 *
 * Back from the date, never forward, for two reasons. A day in the past is
 * judged against what she was aiming at then, which is the only honest way to
 * read it. And with no plan at all — a new account — it still returns nothing,
 * because the fallback is for a target she *set*, not one this could invent.
 *
 * Use it wherever a **target** is read. The week's *meals* are a different
 * question with a different answer: last week's dinners are not on tonight's
 * plan, and `lib/shopping-list.ts` and the planner tools are right to pin the
 * exact week.
 */
export async function targetsForDate(profileId: string, date: ISODate) {
  const [plan] = await db.select().from(mealPlans)
    .where(and(eq(mealPlans.profileId, profileId), lte(mealPlans.weekStart, weekStart(date))))
    .orderBy(desc(mealPlans.weekStart))
    .limit(1);
  return plan ?? null;
}
