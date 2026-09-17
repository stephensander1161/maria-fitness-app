import { and, asc, desc, eq, gt, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { planDays, planExercises, plans, setLogs, workouts } from "@/lib/db/schema";
import { addDays, type ISODate } from "@/lib/date";

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
 * the same movements, the same targets, nothing logged. Editing a week edits
 * the programme from that week on — see `propagateForward` — because a swap
 * made once and forgotten was a swap he had to make every single week.
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
  return copyWeek(profileId, source.id, source.title, week);
}

/**
 * One week's shape, written into another: the same days, the same movements,
 * the same targets, nothing logged. The rationale is left behind — it
 * described a specific week that has been and gone, and nothing is better
 * than stale, the same rule the editing tools follow.
 */
async function copyWeek(profileId: string, sourcePlanId: string, title: string, week: ISODate): Promise<boolean> {
  const days = await db.select().from(planDays)
    .where(eq(planDays.planId, sourcePlanId)).orderBy(asc(planDays.dayOfWeek));
  if (days.length === 0) return false;

  const [copy] = await db.insert(plans).values({ profileId, weekStart: week, title, rationale: null }).returning();

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
      supersetGroup: e.supersetGroup,
    })));
  }
  return true;
}

/**
 * An edit to a week is an edit to the programme from that week on.
 *
 * It was not. A week was copied forward on first view and then owned its
 * shape, so swapping a movement changed that week and nothing else — and he
 * swapped it again the next week, and the one after: "When I change my
 * training day, for example swapping a movement, it should update the plan
 * and update for all future days, not a one-off. I keep having to change the
 * plan week to day." And the copy-on-first-view had a second sting: a week
 * that had already been viewed kept the old shape however the week before it
 * was edited — "I edited next Wed to be right, went to the following
 * Wednesday and it was still the old way."
 *
 * So after any change to week W, every later week that holds no logged sets
 * is rebuilt from W. Weeks with sets in them are hers and are left exactly as
 * they are — a week she has trained is a record, not a template. The
 * one-off case ("skip squats this week, my knee") now needs the swap made
 * back the week after, which is one edit rather than one every week forever.
 *
 * Every tool that writes plan days or plan exercises calls this; the test in
 * tests/plan-rollover.test.ts fails the build if one does not.
 */
export async function propagateForward(profileId: string, week: ISODate): Promise<number> {
  const [source] = await db.select({ id: plans.id, title: plans.title }).from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, week))).limit(1);
  if (!source) return 0;

  const later = await db.select({ id: plans.id, weekStart: plans.weekStart }).from(plans)
    .where(and(eq(plans.profileId, profileId), gt(plans.weekStart, week)))
    .orderBy(asc(plans.weekStart));

  let rebuilt = 0;
  for (const p of later) {
    const [logged] = await db.select({ n: sql<number>`count(*)` })
      .from(setLogs)
      .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
      .where(and(
        eq(workouts.profileId, profileId),
        gte(workouts.date, p.weekStart),
        lte(workouts.date, addDays(p.weekStart as ISODate, 6)),
      ));
    if (Number(logged?.n ?? 0) > 0) continue;
    await db.delete(plans).where(eq(plans.id, p.id));
    if (await copyWeek(profileId, source.id, source.title, p.weekStart as ISODate)) rebuilt++;
  }
  return rebuilt;
}
