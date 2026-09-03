import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  exercises, planDays, planExercises, plans, profiles, setLogs, workouts,
} from "@/lib/db/schema";
import { addDays, dayIndex, weekStart } from "@/lib/date";
import { todayForProfile } from "@/lib/profile";
import { weightLabel, weightOut, type Units } from "@/lib/units";
import {
  estimate1RM, loadStepKg, nextPrescription, sessionBest, warmupRamp, type Session,
} from "@/lib/progression-math";
import { volumeBrief, weeklyVolume } from "@/lib/volume";
import { defineTool } from "./define";

/**
 * What to lift next, and what to warm up with.
 *
 * The arithmetic lives in lib/progression-math.ts and is tested; this is the
 * part that reads her history. The model narrates the result — it does not
 * compute it. A coach that recalculates the load from a partial history every
 * week prescribes inconsistently, and inconsistency in load prescription reads
 * to a beginner as her being inconsistent.
 */

/**
 * The last few sessions of one movement, newest first.
 *
 * `excludeDate` leaves today out. What to lift next is a question about
 * previous sessions — with today included, logging the first set of her life
 * produced a target "up from last time", where last time was the set she had
 * just done ninety seconds earlier.
 */
async function historyFor(
  profileId: string,
  exerciseId: string,
  limit = 6,
  excludeDate?: string,
): Promise<Session[]> {
  const rows = await db
    .select({
      date: workouts.date, reps: setLogs.reps, weightKg: setLogs.weightKg, rir: setLogs.rir,
      setNumber: setLogs.setNumber,
    })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(and(eq(workouts.profileId, profileId), eq(setLogs.exerciseId, exerciseId)))
    .orderBy(desc(workouts.date), setLogs.setNumber)
    .limit(limit * 8);

  const byDate = new Map<string, Session>();
  for (const r of rows) {
    if (excludeDate && r.date === excludeDate) continue;
    const s = byDate.get(r.date) ?? { date: r.date, sets: [] };
    s.sets.push({ reps: r.reps, weightKg: r.weightKg, rir: r.rir });
    byDate.set(r.date, s);
  }
  return [...byDate.values()].slice(0, limit);
}

type Target = {
  slug: string; name: string; exerciseId: string;
  sets: number; reps: number; weightKg: number | null;
  equipment: string[]; bodyweight: boolean;
};

async function plannedFor(profileId: string, date: string): Promise<Target[]> {
  const [plan] = await db.select({ id: plans.id }).from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, weekStart(date)))).limit(1);
  if (!plan) return [];
  const [day] = await db.select({ id: planDays.id }).from(planDays)
    .where(and(eq(planDays.planId, plan.id), eq(planDays.dayOfWeek, dayIndex(date)))).limit(1);
  if (!day) return [];

  const rows = await db
    .select({
      slug: exercises.slug, name: exercises.name, exerciseId: exercises.id,
      equipment: exercises.equipment, bodyweight: exercises.bodyweight,
      sets: planExercises.targetSets, reps: planExercises.targetReps,
      weightKg: planExercises.targetWeightKg, sortOrder: planExercises.sortOrder,
    })
    .from(planExercises)
    .innerJoin(exercises, eq(planExercises.exerciseId, exercises.id))
    .where(eq(planExercises.planDayId, day.id))
    .orderBy(planExercises.sortOrder);
  return rows;
}

async function targetsFor(
  profileId: string, units: Units, targets: Target[], asOf?: string,
) {
  const unit = weightLabel(units);
  return Promise.all(targets.map(async (t) => {
    const history = await historyFor(profileId, t.exerciseId, 6, asOf);
    const step = loadStepKg(t.equipment, units);
    const next = nextPrescription(
      { sets: t.sets, reps: t.reps, weightKg: t.weightKg },
      history,
      { stepKg: step, bodyweight: t.bodyweight },
    );
    const best = history.length ? sessionBest(history[0]) : null;
    const e1rm = best ? { ...best, kg: best.kg } : null;

    return {
      slug: t.slug,
      name: t.name,
      // Labelled for what it is. A target read as an achievement is the exact
      // failure the state block has had before.
      target: {
        sets: next.sets,
        reps: next.reps,
        weight: weightOut(next.weightKg, units),
        unit,
      },
      change: next.change,
      // Composed here, in her units. The maths module is metric and stays
      // metric; a sentence built there reached an imperial user as "up 2kg".
      why: next.change === "up" && next.fromWeightKg !== null
        ? `${next.reason} — ${weightOut(next.fromWeightKg, units)}${unit} to ${weightOut(next.weightKg, units)}${unit}`
        : next.reason,
      warmup: next.weightKg === null ? [] : warmupRamp(next.weightKg, step).map((w) => ({
        weight: weightOut(w.weightKg, units), reps: w.reps, unit,
      })),
      lastTime: history[0]
        ? {
            date: history[0].date,
            sets: history[0].sets.map((s) => ({
              reps: s.reps, weight: weightOut(s.weightKg, units), rir: s.rir,
            })),
          }
        : null,
      estimated1RM: e1rm
        ? { weight: weightOut(e1rm.kg, units), unit, reliable: e1rm.reliable }
        : null,
    };
  }));
}

export const getNextTargets = defineTool({
  name: "get_next_targets",
  description:
    "What to lift on each movement next, worked out from what she actually logged: double progression, the 2-for-2 rule, and the smallest jump her kit can make. Also returns the warm-up ramp and an estimated one-rep max. Use it when she asks what weight to use, or before a session — these are targets to aim at, never achievements, and `why` is the one-line reason to say out loud. Do not compute loads yourself; this already has.",
  input: z.object({
    slug: z.string().optional().describe("One movement. Omit for everything on today's plan."),
    date: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };
    const date = input.date ?? (await todayForProfile(ctx.profileId));

    if (input.slug) {
      const [ex] = await db.select().from(exercises).where(eq(exercises.slug, input.slug)).limit(1);
      if (!ex) return { ok: false, error: `Unknown slug '${input.slug}'. Use search_exercises.` };

      // Whatever the plan says for it this week, or her own last session.
      const planned = (await plannedFor(ctx.profileId, date)).find((p) => p.slug === input.slug);
      const history = await historyFor(ctx.profileId, ex.id, 1);
      const fallbackWeight = history[0]?.sets.find((s) => s.weightKg !== null)?.weightKg ?? null;
      const target: Target = planned ?? {
        slug: ex.slug, name: ex.name, exerciseId: ex.id,
        sets: 3, reps: 10, weightKg: fallbackWeight,
        equipment: ex.equipment, bodyweight: ex.bodyweight,
      };
      const [only] = await targetsFor(ctx.profileId, profile.units, [target], date);
      return { ok: true, date, onPlanToday: planned !== undefined, ...only };
    }

    const planned = await plannedFor(ctx.profileId, date);
    if (planned.length === 0) {
      return { ok: true, date, movements: [], hint: "Nothing planned for that day — pass a slug for a single movement." };
    }
    return {
      ok: true, date,
      movements: await targetsFor(ctx.profileId, profile.units, planned, date),
    };
  },
});

export const estimateOneRepMax = defineTool({
  name: "estimate_one_rep_max",
  description:
    "Her estimated one-rep max on a movement, from her heaviest recent set and how many reps she had left in it. Say the number only when `reliable` is true — over about twelve effective reps, or with no reps-in-reserve recorded, the estimate drifts far enough to be misleading, and `why` says which it is. Useful for setting a milestone or picking a starting weight, not for prescribing loads: get_next_targets does that.",
  input: z.object({ slug: z.string() }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };
    const [ex] = await db.select().from(exercises)
      .where(eq(exercises.slug, input.slug)).limit(1);
    if (!ex) return { ok: false, error: `Unknown slug '${input.slug}'. Use search_exercises.` };
    if (ex.bodyweight) {
      return { ok: false, error: `${ex.name} is a bodyweight movement — there is no load to estimate from.` };
    }

    const history = await historyFor(ctx.profileId, ex.id, 4);
    const estimates = history
      .map((s) => ({ date: s.date, best: sessionBest(s) }))
      .filter((e): e is { date: string; best: NonNullable<ReturnType<typeof sessionBest>> } => e.best !== null);
    if (estimates.length === 0) {
      return { ok: false, error: `Nothing logged for ${ex.name} with a weight on it yet.` };
    }

    const top = estimates.reduce((a, b) => (b.best.kg > a.best.kg ? b : a));
    const unit = weightLabel(profile.units);
    return {
      ok: true,
      exercise: ex.name,
      estimate: weightOut(top.best.kg, profile.units),
      unit,
      reliable: top.best.reliable,
      why: estimate1RM(top.best.set)?.why,
      from: {
        date: top.date, reps: top.best.set.reps,
        weight: weightOut(top.best.set.weightKg, profile.units), rir: top.best.set.rir,
      },
      recent: estimates.map((e) => ({
        date: e.date, estimate: weightOut(e.best.kg, profile.units), reliable: e.best.reliable,
      })),
    };
  },
});

export const getWeeklyVolume = defineTool({
  name: "get_weekly_volume",
  description:
    "Hard sets per muscle group over a week, against what a beginner in a deficit actually needs. Use it to spot a week that is out of balance — shoulders getting three times what legs got — and before building a new one. Present it to her as balance, never as a target to hit: these are population ranges with huge individual spread, and turning them into a score to max out is how a sensible week becomes junk volume and a sore back.",
  input: z.object({
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
  }),
  handler: async (input, ctx) => {
    const her = await todayForProfile(ctx.profileId);
    const week = input.weekStart ?? weekStart(her);
    const volume = await volumeForWeek(ctx.profileId, week);

    return {
      weekStart: week,
      groups: volume.groups.map((g) => ({
        group: g.group, sets: g.sets, status: g.status,
        needsAtLeast: g.enough, plentyAt: g.plenty,
      })),
      // Said rather than hidden: sets of grip work, neck work and conditioning
      // are real work that no landmark describes.
      setsNoLandmarkCovers: volume.unmapped,
      summary: volumeBrief(volume),
    };
  },
});

/** Hard sets by group for a week, from what she actually logged. */
export async function volumeForWeek(profileId: string, week: string) {
  const rows = await db
    .select({ muscles: exercises.primaryMuscles })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(and(
      eq(workouts.profileId, profileId),
      gte(workouts.date, week),
      lte(workouts.date, addDays(week, 6)),
    ));
  return weeklyVolume(rows);
}

/** Shared with the Train screen, which shows targets and warm-ups inline. */
export async function todayTargets(profileId: string, units: Units, date: string) {
  const planned = await plannedFor(profileId, date);
  if (planned.length === 0) return [];
  return targetsFor(profileId, units, planned, date);
}
