import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  exercises, planDays, planExercises, plans, profiles, setLogs, workouts,
} from "@/lib/db/schema";
import { today, weekStart } from "@/lib/date";
import { inToCm, weightIn } from "@/lib/units";

/**
 * Fixtures for the scratch profile.
 *
 * These write straight to the tables rather than going through the tool
 * registry on purpose: seeding through the tools would make the setup depend on
 * the same behaviour the eval is trying to measure. Numbers are given in *her*
 * display units (pounds, inches) and converted here, so a fixture reads the way
 * the coach will see it.
 */

/** She is not this app's real user: the name is a marker, not a person. */
export const SCRATCH_NAME = "Eval Scratch";

/** A blank row — what onboarding actually starts from. */
export const blankProfile = (): Partial<typeof profiles.$inferInsert> => ({
  units: "imperial",
});

/** A fully onboarded profile, so a case can get straight to the behaviour. */
export function onboardedProfile(
  over: Partial<typeof profiles.$inferInsert> = {},
): Partial<typeof profiles.$inferInsert> {
  return {
    name: SCRATCH_NAME,
    birthYear: new Date().getFullYear() - 34,
    sex: "female",
    heightCm: inToCm(66),
    startWeightKg: weightIn(168, "imperial"),
    goalWeightKg: weightIn(148, "imperial"),
    motivation: "wants to feel strong again and keep up with her kids",
    activityLevel: "light",
    experience: "beginner",
    daysPerWeek: 3,
    sessionMinutes: 45,
    equipment: ["dumbbells", "bench", "resistance bands"],
    injuries: [],
    dietaryRestrictions: [],
    dislikedFoods: [],
    cookingSkill: "comfortable",
    units: "imperial",
    onboardedAt: new Date(),
    ...over,
  };
}

async function idsBySlug(slugs: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: exercises.id, slug: exercises.slug })
    .from(exercises)
    .where(inArray(exercises.slug, slugs));
  const map = new Map(rows.map((r) => [r.slug, r.id]));
  const missing = slugs.filter((s) => !map.has(s));
  if (missing.length) {
    // Loud on purpose: a fixture built on a slug that no longer exists would
    // otherwise silently become an eval that tests nothing.
    throw new Error(`seed: unknown exercise slugs ${missing.join(", ")} — run npm run db:seed`);
  }
  return map;
}

export type SeededSet = { reps: number; weightLb?: number };
export type SeededExercise = { slug: string; sets: SeededSet[] };

/** A completed (or in-progress) session with its sets already logged — the
 *  state she is in when she taps through the Train screen and then talks. */
export async function seedWorkout(
  profileId: string,
  opts: { date?: string; title: string; entries: SeededExercise[]; finished?: boolean },
) {
  const date = opts.date ?? today();
  const ids = await idsBySlug(opts.entries.map((e) => e.slug));

  const [w] = await db
    .insert(workouts)
    .values({
      profileId,
      date,
      title: opts.title,
      completedAt: opts.finished ? new Date() : null,
      feeling: opts.finished ? 3 : null,
    })
    .returning();

  const rows = opts.entries.flatMap((entry) =>
    entry.sets.map((s, i) => ({
      workoutId: w.id,
      exerciseId: ids.get(entry.slug)!,
      setNumber: i + 1,
      reps: s.reps,
      weightKg: s.weightLb === undefined ? null : weightIn(s.weightLb, "imperial"),
    })),
  );
  if (rows.length) await db.insert(setLogs).values(rows);
  return w;
}

export type SeededPlanDay = {
  dayOfWeek: number;
  title: string;
  isRest?: boolean;
  focus?: string;
  exercises?: { slug: string; sets: number; reps: number; weightLb?: number }[];
};

/** A full seven-day plan, the way create_weekly_plan would have left it. */
export async function seedPlanWeek(
  profileId: string,
  opts: { week?: string; title: string; days: SeededPlanDay[] },
) {
  const week = opts.week ?? weekStart();
  const slugs = [...new Set(opts.days.flatMap((d) => d.exercises?.map((e) => e.slug) ?? []))];
  const ids = slugs.length ? await idsBySlug(slugs) : new Map<string, string>();

  const [plan] = await db
    .insert(plans)
    .values({
      profileId,
      weekStart: week,
      title: opts.title,
      rationale: "Seeded by the eval harness.",
    })
    .returning();

  for (const day of opts.days) {
    const [pd] = await db
      .insert(planDays)
      .values({
        planId: plan.id,
        dayOfWeek: day.dayOfWeek,
        title: day.title,
        focus: day.focus ?? null,
        isRest: day.isRest ?? false,
      })
      .returning();

    const list = day.exercises ?? [];
    if (list.length) {
      await db.insert(planExercises).values(
        list.map((e, i) => ({
          planDayId: pd.id,
          exerciseId: ids.get(e.slug)!,
          sortOrder: i,
          targetSets: e.sets,
          targetReps: e.reps,
          targetWeightKg: e.weightLb === undefined ? null : weightIn(e.weightLb, "imperial"),
        })),
      );
    }
  }
  return plan;
}

/** Read back one plan day's exercise slugs — how a "did it actually change?"
 *  assertion checks the claim against the database. */
export async function planDaySlugs(
  profileId: string,
  dayOfWeek: number,
  week = weekStart(),
): Promise<string[] | null> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, week)))
    .limit(1);
  if (!plan) return null;

  const [day] = await db
    .select()
    .from(planDays)
    .where(and(eq(planDays.planId, plan.id), eq(planDays.dayOfWeek, dayOfWeek)))
    .limit(1);
  if (!day) return null;

  const rows = await db
    .select({ slug: exercises.slug, sortOrder: planExercises.sortOrder })
    .from(planExercises)
    .innerJoin(exercises, eq(planExercises.exerciseId, exercises.id))
    .where(eq(planExercises.planDayId, day.id))
    .orderBy(planExercises.sortOrder);
  return rows.map((r) => r.slug);
}
