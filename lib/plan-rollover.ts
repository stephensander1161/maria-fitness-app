import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { planDays, planExercises, plans } from "@/lib/db/schema";
import type { ISODate } from "@/lib/date";

/**
 * A training week that carries on into the next one.
 *
 * A plan was a single week, and Monday morning it stopped existing: the Train
 * screen said "no workout planned" and the whole thing had to be rebuilt or
 * asked for again. Nobody trains like that. A programme is a shape you repeat
 * — three sessions a week, the same movements, the numbers creeping up — and
 * the app should hold that shape by default.
 *
 * So a week with no plan inherits the last one that existed: the same days,
 * the same movements, the same targets, nothing logged. Editing it changes
 * *that* week and nothing else, which is what makes "this week I'll swap the
 * squats" work without redesigning the programme.
 *
 * Copied rather than pointed at, deliberately. A virtual plan that reads
 * through to last week cannot be edited without either changing history or
 * growing a pile of per-week overrides, and both are worse than one extra
 * row per day per week for an app this size.
 *
 * Idempotent: it does nothing at all when the week already has a plan, which
 * is every call after the first.
 */
export async function rollForward(profileId: string, week: ISODate): Promise<boolean> {
  const [already] = await db.select({ id: plans.id }).from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, week))).limit(1);
  if (already) return false;

  // The most recent week *before* this one. Not simply "the latest": stepping
  // back to an empty week in the past should inherit what she was doing then,
  // not what she is doing now.
  const [source] = await db.select().from(plans)
    .where(and(eq(plans.profileId, profileId), lt(plans.weekStart, week)))
    .orderBy(desc(plans.weekStart)).limit(1);
  if (!source) return false;

  const days = await db.select().from(planDays)
    .where(eq(planDays.planId, source.id)).orderBy(asc(planDays.dayOfWeek));
  if (days.length === 0) return false;

  const [copy] = await db.insert(plans).values({
    profileId, weekStart: week, title: source.title,
    // The rationale described a specific week that has now been and gone.
    // Nothing is better than stale — the same rule the editing tools follow.
    rationale: null,
  }).returning();

  for (const day of days) {
    const [newDay] = await db.insert(planDays).values({
      planId: copy.id, dayOfWeek: day.dayOfWeek, title: day.title,
      focus: day.focus, isRest: day.isRest, notes: day.notes,
    }).returning();

    const exercises = await db.select().from(planExercises)
      .where(eq(planExercises.planDayId, day.id)).orderBy(asc(planExercises.sortOrder));
    if (exercises.length === 0) continue;

    await db.insert(planExercises).values(exercises.map((e) => ({
      planDayId: newDay.id,
      exerciseId: e.exerciseId,
      sortOrder: e.sortOrder,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      targetHoldSeconds: e.targetHoldSeconds,
      targetWeightKg: e.targetWeightKg,
      restSeconds: e.restSeconds,
      notes: e.notes,
    })));
  }
  return true;
}
