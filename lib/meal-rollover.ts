import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { mealPlans, meals } from "@/lib/db/schema";
import type { ISODate } from "@/lib/date";

/**
 * A food week that carries on into the next one.
 *
 * The training plan has done this since `lib/plan-rollover.ts`: a week with no
 * plan inherits the last one, because a programme is a shape you repeat and
 * Monday morning should not be an empty app. Food was left behind, and it is
 * the half people notice first — the targets vanished with the plan, so Eat
 * drew the day's totals over six empty bars and the coach answered "you have
 * no target set" while reporting her intake against one.
 *
 * "the plans should just carry over week to week, unless explicitly changed."
 *
 * So the same rule, the same shape. A week with no meal plan inherits the last
 * one that existed: the same targets, the same meals on the same days, nothing
 * logged. Editing it changes *that* week — swapping Tuesday's dinner does not
 * redesign the month — and asking for a new plan overwrites it, which is what
 * "unless explicitly changed" means.
 *
 * Copied rather than pointed at, for the reason plan-rollover gives: a virtual
 * week that reads through to the last one cannot be edited without either
 * rewriting history or growing a pile of per-week overrides.
 *
 * Idempotent: nothing at all when the week already has a plan, which is every
 * call after the first.
 */
export async function rollMealsForward(profileId: string, week: ISODate): Promise<boolean> {
  const [already] = await db.select({ id: mealPlans.id }).from(mealPlans)
    .where(and(eq(mealPlans.profileId, profileId), eq(mealPlans.weekStart, week))).limit(1);
  if (already) return false;

  // The most recent week *before* this one, never simply the latest: stepping
  // back to an empty week in the past should inherit what she was eating then,
  // not what she is eating now.
  const [source] = await db.select().from(mealPlans)
    .where(and(eq(mealPlans.profileId, profileId), lt(mealPlans.weekStart, week)))
    .orderBy(desc(mealPlans.weekStart)).limit(1);
  if (!source) return false;

  const [copy] = await db.insert(mealPlans).values({
    profileId,
    weekStart: week,
    calorieTarget: source.calorieTarget,
    proteinTargetG: source.proteinTargetG,
    carbTargetG: source.carbTargetG,
    fatTargetG: source.fatTargetG,
    // The rationale explained a week that has been and gone. Nothing beats
    // stale — the same rule the training rollover and the editing tools follow.
    rationale: null,
  })
    // Two tabs opening Monday morning at once. The unique index on
    // (profile, week) is what decides it; whichever loses simply does nothing.
    .onConflictDoNothing({ target: [mealPlans.profileId, mealPlans.weekStart] })
    .returning();
  if (!copy) return false;

  const week1 = await db.select().from(meals)
    .where(eq(meals.mealPlanId, source.id))
    .orderBy(asc(meals.dayOfWeek), asc(meals.sortOrder));
  if (week1.length === 0) return true;

  await db.insert(meals).values(week1.map((m) => ({
    mealPlanId: copy.id,
    dayOfWeek: m.dayOfWeek,
    slot: m.slot,
    title: m.title,
    calories: m.calories,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    ingredients: m.ingredients,
    // The recipe comes with it. It is the same meal, and making her pay for
    // the model to write the steps again every Monday is the cost this app
    // watches hardest — see `get_meal_recipe`, which only writes into a blank.
    steps: m.steps,
    prepMinutes: m.prepMinutes,
    sortOrder: m.sortOrder,
  })));
  return true;
}
