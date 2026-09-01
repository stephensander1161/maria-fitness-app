import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  exercises, planDays, planExercises, plans, profiles, setLogs, workouts,
} from "@/lib/db/schema";
import { addDays, DAY_NAMES, dayIndex, FUTURE_DATE_ERROR, isFuture, weekStart, type ISODate } from "@/lib/date";
import { weightIn, weightLabel, weightOut } from "@/lib/units";
import { compareToPrevious, exerciseHistory, lastTimeTargets, weekReview } from "@/lib/progress";
import { planWeek, resolveSlugs } from "@/lib/agent/planner";
import { weekView } from "@/lib/views";
import { profileToday, todayForProfile } from "@/lib/profile";
import { defineTool, type ToolContext } from "./define";

async function unitsOf(ctx: ToolContext) {
  const [p] = await db.select({ units: profiles.units }).from(profiles)
    .where(eq(profiles.id, ctx.profileId)).limit(1);
  return p?.units ?? "imperial";
}

/** Today in her timezone — never the server's. */
async function todayFor(ctx: ToolContext) {
  const [p] = await db.select({ timezone: profiles.timezone }).from(profiles)
    .where(eq(profiles.id, ctx.profileId)).limit(1);
  return profileToday(p ?? { timezone: null });
}

export const searchExercises = defineTool({
  name: "search_exercises",
  description:
    "Search the exercise library by name, muscle group, equipment, or complaint — 'postpartum', 'diastasis', 'pelvic floor', 'physio', 'neck' all work. ALWAYS use this to find valid exercise slugs before building or adjusting a plan — every other training tool identifies exercises by slug.",
  input: z.object({
    query: z.string().optional().describe("Name or muscle, e.g. 'squat', 'glutes', 'back'"),
    equipment: z.string().optional().describe("Filter to what she has, e.g. 'dumbbell', 'bodyweight'"),
    category: z.enum(["compound", "isolation", "cardio", "mobility", "core"]).optional(),
    limit: z.number().optional(),
  }),
  handler: async (input) => {
    const filters = [];
    if (input.query) {
      const q = `%${input.query}%`;
      filters.push(or(
        ilike(exercises.name, q),
        ilike(exercises.slug, q),
        sql`${exercises.primaryMuscles}::text ilike ${q}`,
        // Tags carry the complaint — "diastasis", "postpartum", "physio" —
        // which is how she and the coach actually look for this content.
        sql`${exercises.tags}::text ilike ${q}`,
      ));
    }
    if (input.equipment) filters.push(sql`${exercises.equipment}::text ilike ${`%${input.equipment}%`}`);
    if (input.category) filters.push(eq(exercises.category, input.category));

    const rows = await db.select({
      slug: exercises.slug, name: exercises.name, category: exercises.category,
      primaryMuscles: exercises.primaryMuscles, equipment: exercises.equipment,
      tags: exercises.tags,
      bodyweight: exercises.bodyweight,
    }).from(exercises)
      .where(filters.length ? and(...filters) : undefined)
      .limit(input.limit ?? 25);
    return rows;
  },
});

export const getExerciseGuide = defineTool({
  name: "get_exercise_guide",
  description:
    "Full form and posture guidance for one exercise: setup cues in order, the mistakes people actually make, what to stop for, and easier/harder variations. Use this whenever she asks how to do something, says a movement hurts, or needs a regression.",
  input: z.object({ slug: z.string() }),
  handler: async (input) => {
    const [ex] = await db.select().from(exercises).where(eq(exercises.slug, input.slug)).limit(1);
    if (!ex) return { error: `No exercise with slug '${input.slug}'. Use search_exercises to find valid slugs.` };
    return {
      slug: ex.slug, name: ex.name, category: ex.category,
      primaryMuscles: ex.primaryMuscles, equipment: ex.equipment,
      formCues: ex.formCues, commonMistakes: ex.commonMistakes,
      safetyNote: ex.safetyNote,
      easier: ex.easierAlternatives, harder: ex.harderAlternatives,
    };
  },
});

const planExerciseInput = z.object({
  slug: z.string().describe("From search_exercises"),
  sets: z.number(),
  reps: z.number(),
  weight: z.number().nullable().optional()
    .describe("Working weight in her units; omit for bodyweight or when unknown"),
  restSeconds: z.number().optional(),
  notes: z.string().optional().describe("A cue or tempo note shown next to the exercise"),
});

export const createWeeklyPlan = defineTool({
  name: "create_weekly_plan",
  description:
    "Build or replace the training plan for a week. You describe the intent; a dedicated planner writes the actual week from her profile, equipment and injuries, and from the real exercise library — so you do not need to pick movements or look up slugs yourself. Takes a few seconds. Re-running for the same week replaces it.",
  input: z.object({
    focus: z.string().optional()
      .describe("What this week should emphasise, if she asked for something specific"),
    notes: z.string().optional()
      .describe("Anything the planner should know — a sore shoulder, a busy week, a deload"),
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };

    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));

    // Hand the planner last week so it can progress rather than restart.
    const previousView = await weekView(ctx.profileId, profile.units, addDays(week, -7));
    const previous = previousView.exists
      ? previousView.days
          .filter((d) => !d.isRest)
          .map((d) => `${d.dayName}: ${d.exercises.map((e) => `${e.name} ${e.target}`).join(", ")}`)
          .join("\n")
      : undefined;

    let drafted;
    try {
      drafted = await planWeek(profile, { ...input, weekStart: week, previous });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Planning failed." };
    }

    const slugs = [...new Set(drafted.days.flatMap((d) => d.exercises?.map((e) => e.slug) ?? []))];
    const { bySlug, unknown } = await resolveSlugs(slugs);
    if (unknown.length) {
      return { ok: false, error: "The planner used movements that aren't in the library", unknownSlugs: unknown };
    }

    const [plan] = await db.insert(plans)
      .values({ profileId: ctx.profileId, weekStart: week, title: drafted.title, rationale: drafted.rationale })
      .onConflictDoUpdate({
        target: [plans.profileId, plans.weekStart],
        set: { title: drafted.title, rationale: drafted.rationale },
      })
      .returning();

    await db.delete(planDays).where(eq(planDays.planId, plan.id)); // cascades

    for (const day of drafted.days) {
      const isRest = day.isRest ?? (day.exercises?.length ?? 0) === 0;
      const [pd] = await db.insert(planDays).values({
        planId: plan.id,
        dayOfWeek: day.dayOfWeek,
        // Derived when the planner leaves it out, rather than failing the week.
        title: day.title ?? day.focus ?? (isRest ? "Rest" : "Training"),
        focus: day.focus ?? null,
        isRest,
        notes: day.notes ?? null,
      }).returning();

      const list = day.exercises ?? [];
      if (list.length) {
        await db.insert(planExercises).values(list.map((e, i) => ({
          planDayId: pd.id,
          exerciseId: bySlug.get(e.slug)!,
          sortOrder: i,
          targetSets: e.sets,
          targetReps: e.reps,
          targetWeightKg: e.weight === null || e.weight === undefined ? null : weightIn(e.weight, profile.units),
          restSeconds: e.restSeconds ?? 90,
          notes: e.notes ?? null,
        })));
      }
    }

    return {
      ok: true,
      weekStart: week,
      title: drafted.title,
      rationale: drafted.rationale,
      days: drafted.days.map((d) => ({
        day: DAY_NAMES[d.dayOfWeek],
        title: d.title ?? d.focus ?? "Training",
        exercises: (d.exercises ?? []).length,
      })),
      hint: "Walk her through it in your own words — don't just repeat the rationale back.",
    };
  },
});

export const getPlan = defineTool({
  name: "get_plan",
  description:
    "The workout plan for a week, with each day's exercises, targets, and what she lifted last time on each movement. Use this before advising on today's session.",
  input: z.object({ weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week") }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));
    const [plan] = await db.select().from(plans)
      .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, week))).limit(1);
    if (!plan) return { exists: false, weekStart: week, hint: "No plan for this week — call create_weekly_plan." };

    const days = await db.select().from(planDays)
      .where(eq(planDays.planId, plan.id)).orderBy(planDays.dayOfWeek);

    const items = await db.select({
      planDayId: planExercises.planDayId,
      slug: exercises.slug, name: exercises.name, bodyweight: exercises.bodyweight,
      exerciseId: exercises.id,
      sets: planExercises.targetSets, reps: planExercises.targetReps,
      weightKg: planExercises.targetWeightKg, restSeconds: planExercises.restSeconds,
      notes: planExercises.notes, sortOrder: planExercises.sortOrder,
    }).from(planExercises)
      .innerJoin(exercises, eq(planExercises.exerciseId, exercises.id))
      .where(inArray(planExercises.planDayId, days.map((d) => d.id)))
      .orderBy(planExercises.sortOrder);

    const lastTime = await lastTimeTargets(ctx.profileId, [...new Set(items.map((i) => i.exerciseId))]);

    return {
      exists: true, weekStart: week, title: plan.title, rationale: plan.rationale,
      unit: weightLabel(units),
      todayIsDayOfWeek: dayIndex(await todayForProfile(ctx.profileId)),
      days: days.map((d) => ({
        dayOfWeek: d.dayOfWeek, dayName: DAY_NAMES[d.dayOfWeek],
        title: d.title, focus: d.focus, isRest: d.isRest, notes: d.notes,
        exercises: items.filter((i) => i.planDayId === d.id).map((i) => {
          const prev = lastTime.get(i.exerciseId);
          return {
            slug: i.slug, name: i.name,
            target: `${i.sets}×${i.reps}${i.weightKg !== null ? ` @ ${weightOut(i.weightKg, units)}` : ""}`,
            restSeconds: i.restSeconds, notes: i.notes,
            lastTime: prev
              ? { date: prev.date, sets: prev.sets.map((s) => ({ reps: s.reps, weight: weightOut(s.weightKg, units) })) }
              : null,
          };
        }),
      })),
    };
  },
});

export const adjustPlanDay = defineTool({
  name: "adjust_plan_day",
  description:
    "Change one day of the current plan — swap an exercise she dislikes or can't do, change sets/reps/weight, add or remove a movement, or convert the day to rest. Use this for her in-flight requests rather than regenerating the whole week.",
  input: z.object({
    dayOfWeek: z.number().describe("0=Monday … 6=Sunday"),
    weekStart: z.string().optional(),
    title: z.string().optional(),
    focus: z.string().optional(),
    isRest: z.boolean().optional(),
    notes: z.string().optional(),
    exercises: z.array(planExerciseInput).optional()
      .describe("Replaces the day's full exercise list. Omit to keep the existing list."),
  }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));
    const [plan] = await db.select().from(plans)
      .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, week))).limit(1);
    if (!plan) return { ok: false, error: "No plan for that week. Call create_weekly_plan first." };

    const [day] = await db.select().from(planDays)
      .where(and(eq(planDays.planId, plan.id), eq(planDays.dayOfWeek, input.dayOfWeek))).limit(1);
    if (!day) return { ok: false, error: `No day ${input.dayOfWeek} in that plan.` };

    const patch: Partial<typeof planDays.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.focus !== undefined) patch.focus = input.focus;
    if (input.isRest !== undefined) patch.isRest = input.isRest;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (Object.keys(patch).length) await db.update(planDays).set(patch).where(eq(planDays.id, day.id));

    if (input.exercises) {
      const slugs = [...new Set(input.exercises.map((e) => e.slug))];
      const found = slugs.length
        ? await db.select({ id: exercises.id, slug: exercises.slug }).from(exercises)
            .where(inArray(exercises.slug, slugs))
        : [];
      const bySlug = new Map(found.map((e) => [e.slug, e.id]));
      const unknown = slugs.filter((s) => !bySlug.has(s));
      if (unknown.length) return { ok: false, error: "Unknown exercise slugs", unknownSlugs: unknown };

      await db.delete(planExercises).where(eq(planExercises.planDayId, day.id));
      if (input.exercises.length) {
        await db.insert(planExercises).values(input.exercises.map((e, i) => ({
          planDayId: day.id, exerciseId: bySlug.get(e.slug)!, sortOrder: i,
          targetSets: e.sets, targetReps: e.reps,
          targetWeightKg: e.weight === null || e.weight === undefined ? null : weightIn(e.weight, units),
          restSeconds: e.restSeconds ?? 90, notes: e.notes ?? null,
        })));
      }
    }
    return { ok: true, dayOfWeek: input.dayOfWeek, dayName: DAY_NAMES[input.dayOfWeek] };
  },
});

/** Find today's open workout, or open one from the plan. Shared by log_set and
 *  the fast-log UI so both land in the same session row. */
// `date` is required: both callers compute it in her timezone, and a default
// in the server's would silently open a session on the wrong day.
export async function ensureWorkout(ctx: ToolContext, date: ISODate) {
  const [open] = await db.select().from(workouts)
    .where(and(eq(workouts.profileId, ctx.profileId), eq(workouts.date, date)))
    .orderBy(desc(workouts.startedAt)).limit(1);
  if (open) return open;

  const week = weekStart(date);
  const [plan] = await db.select({ id: plans.id }).from(plans)
    .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, week))).limit(1);
  let planDay: { id: string; title: string } | undefined;
  if (plan) {
    [planDay] = await db.select({ id: planDays.id, title: planDays.title }).from(planDays)
      .where(and(eq(planDays.planId, plan.id), eq(planDays.dayOfWeek, dayIndex(date)))).limit(1);
  }
  const [created] = await db.insert(workouts).values({
    profileId: ctx.profileId, date,
    planDayId: planDay?.id ?? null,
    title: planDay?.title ?? "Freestyle session",
  }).returning();
  return created;
}

export const startWorkout = defineTool({
  name: "start_workout",
  description:
    "Open today's workout session so sets can be logged against it. Safe to call repeatedly — it returns the existing session if one is already open.",
  input: z.object({ date: z.string().optional(), title: z.string().optional() }),
  handler: async (input, ctx) => {
    const when = input.date ?? (await todayFor(ctx));
    if (isFuture(when, await todayFor(ctx))) return { ok: false, error: FUTURE_DATE_ERROR };
    const w = await ensureWorkout(ctx, when);
    if (input.title && input.title !== w.title) {
      await db.update(workouts).set({ title: input.title }).where(eq(workouts.id, w.id));
    }
    return { workoutId: w.id, date: w.date, title: input.title ?? w.title };
  },
});

export const logSet = defineTool({
  name: "log_set",
  description:
    "Record one completed set. Opens today's session automatically if needed. Returns how this set compares to the last time she trained that movement — use that comparison in your reply, including when it is down.",
  input: z.object({
    exerciseSlug: z.string(),
    reps: z.number(),
    weight: z.number().nullable().optional().describe("Her units; omit for bodyweight movements"),
    rpe: z.number().nullable().optional().describe("1–10 perceived effort, if she mentions it"),
    date: z.string().optional(),
    clientKey: z.string().optional().describe(
      "Supplied by the app for retry safety. Leave this out.",
    ),
  }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const [ex] = await db.select().from(exercises).where(eq(exercises.slug, input.exerciseSlug)).limit(1);
    if (!ex) return { ok: false, error: `Unknown slug '${input.exerciseSlug}'. Use search_exercises.` };

    const when = input.date ?? (await todayFor(ctx));
    if (isFuture(when, await todayFor(ctx))) return { ok: false, error: FUTURE_DATE_ERROR };

    const w = await ensureWorkout(ctx, when);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(setLogs)
      .where(and(eq(setLogs.workoutId, w.id), eq(setLogs.exerciseId, ex.id)));

    // onConflictDoNothing on the client key: a retry of a request that actually
    // landed returns nothing here, and we report success without logging twice.
    const inserted = await db.insert(setLogs).values({
      workoutId: w.id, exerciseId: ex.id, setNumber: n + 1, reps: input.reps,
      weightKg: input.weight === null || input.weight === undefined ? null : weightIn(input.weight, units),
      rpe: input.rpe ?? null,
      clientKey: input.clientKey ?? null,
    }).onConflictDoNothing({ target: setLogs.clientKey }).returning({ id: setLogs.id });

    if (inserted.length === 0) {
      const comparison = await compareToPrevious(ctx.profileId, ex.id, units);
      return {
        ok: true, duplicate: true, exercise: ex.name,
        reps: input.reps, weight: input.weight ?? null, unit: weightLabel(units),
        vsLastTime: comparison.status, comparison: comparison.headline,
      };
    }

    const comparison = await compareToPrevious(ctx.profileId, ex.id, units);
    return {
      ok: true, exercise: ex.name, setNumber: n + 1,
      reps: input.reps, weight: input.weight ?? null, unit: weightLabel(units),
      vsLastTime: comparison.status,
      comparison: comparison.headline,
    };
  },
});

export const finishWorkout = defineTool({
  name: "finish_workout",
  description:
    "Close out today's session with how it felt (1–5). Returns a summary of everything logged and how it stacked up against last time — the natural moment to celebrate or to name a shortfall honestly.",
  input: z.object({
    feeling: z.number().optional().describe("1 = brutal, 5 = easy"),
    notes: z.string().optional(),
    date: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const date = input.date ?? (await todayFor(ctx));
    if (isFuture(date, await todayFor(ctx))) return { ok: false, error: FUTURE_DATE_ERROR };
    const [w] = await db.select().from(workouts)
      .where(and(eq(workouts.profileId, ctx.profileId), eq(workouts.date, date)))
      .orderBy(desc(workouts.startedAt)).limit(1);
    if (!w) return { ok: false, error: "No workout logged for that date." };

    await db.update(workouts)
      .set({ completedAt: new Date(), feeling: input.feeling ?? null, notes: input.notes ?? null })
      .where(eq(workouts.id, w.id));

    const logged = await db.select({
      exerciseId: setLogs.exerciseId, name: exercises.name,
      reps: setLogs.reps, weightKg: setLogs.weightKg, setNumber: setLogs.setNumber,
    }).from(setLogs)
      .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
      .where(eq(setLogs.workoutId, w.id)).orderBy(setLogs.setNumber);

    const ids = [...new Set(logged.map((l) => l.exerciseId))];
    const comparisons = await Promise.all(ids.map((id) => compareToPrevious(ctx.profileId, id, units)));

    return {
      ok: true, date, title: w.title,
      totalSets: logged.length,
      totalVolume: Math.round(logged.reduce((n, l) => n + (l.weightKg ?? 0) * l.reps, 0) * (units === "imperial" ? 2.20462 : 1)),
      unit: weightLabel(units),
      beat: comparisons.filter((c) => c.status === "beat").map((c) => c.headline),
      matched: comparisons.filter((c) => c.status === "matched").map((c) => c.headline),
      missed: comparisons.filter((c) => c.status === "missed").map((c) => c.headline),
    };
  },
});

export const getExerciseHistory = defineTool({
  name: "get_exercise_history",
  description:
    "Session-by-session history for one movement, newest first, with the trend versus the previous outing. Use this to set today's target or to answer 'what did I do last week?'.",
  input: z.object({ slug: z.string(), limit: z.number().optional() }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const [ex] = await db.select().from(exercises).where(eq(exercises.slug, input.slug)).limit(1);
    if (!ex) return { error: `Unknown slug '${input.slug}'.` };
    const history = await exerciseHistory(ctx.profileId, ex.id, input.limit ?? 8);
    const cmp = await compareToPrevious(ctx.profileId, ex.id, units);
    return {
      exercise: ex.name, slug: ex.slug, unit: weightLabel(units),
      trend: cmp.status, summary: cmp.headline,
      sessions: history.map((h) => ({
        date: h.date, totalReps: h.totalReps,
        volume: Math.round(h.volumeKg * (units === "imperial" ? 2.20462 : 1)),
        sets: h.sets.map((s) => ({ reps: s.reps, weight: weightOut(s.weightKg, units), rpe: s.rpe })),
      })),
    };
  },
});

export const getWeekReview = defineTool({
  name: "get_week_review",
  description:
    "The honest weekly report: sessions completed vs planned, which planned days were missed, total volume, which lifts improved, which went backwards, and the weight trend. Use this for check-ins, and always name the misses as well as the wins.",
  input: z.object({ weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week") }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const r = await weekReview(ctx.profileId, units, input.weekStart ?? weekStart(await todayForProfile(ctx.profileId)));
    return {
      ...r,
      totalVolume: Math.round(r.totalVolumeKg * (units === "imperial" ? 2.20462 : 1)),
      weightChange: weightOut(r.weightChangeKg, units),
      latestWeight: weightOut(r.latestWeightKg, units),
      unit: weightLabel(units),
    };
  },
});

/** Resolve the plan day for a date (or an explicit weekday) in one place. */
async function planDayFor(
  profileId: string,
  opts: { dayOfWeek?: number; weekStart?: string },
) {
  // One lookup, not two: this helper backs add_exercise_to_day and
  // remove_exercise_from_day, which defaulted to the server's weekday and so
  // edited the wrong day of her plan every evening.
  const hers = await todayForProfile(profileId);
  const week = opts.weekStart ?? weekStart(hers);
  const dow = opts.dayOfWeek ?? dayIndex(hers);
  const [plan] = await db.select({ id: plans.id }).from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, week))).limit(1);
  if (!plan) return { error: "No plan for that week yet. Call create_weekly_plan first." } as const;

  const [day] = await db.select().from(planDays)
    .where(and(eq(planDays.planId, plan.id), eq(planDays.dayOfWeek, dow))).limit(1);
  if (!day) return { error: `That plan has no ${DAY_NAMES[dow] ?? "day"}.` } as const;
  return { day, week, dow } as const;
}

export const addExerciseToDay = defineTool({
  name: "add_exercise_to_day",
  description:
    "Append one exercise to a day of the current plan, leaving everything else in place. Use this when she wants to add something to today rather than rebuild the week — 'throw in some curls', 'can I add core work'. Defaults to today.",
  input: z.object({
    slug: z.string().describe("From search_exercises"),
    sets: z.number(),
    reps: z.number(),
    weight: z.number().nullable().optional().describe("Her units; omit for bodyweight or unknown"),
    restSeconds: z.number().optional(),
    notes: z.string().optional(),
    dayOfWeek: z.number().optional().describe(
      "OMIT for today — that is almost always what she means. Only pass this when she names a different day. 0=Monday … 6=Sunday.",
    ),
    weekStart: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const found = await planDayFor(ctx.profileId, input);
    if ("error" in found) return { ok: false, error: found.error };

    const [ex] = await db.select({ id: exercises.id, name: exercises.name })
      .from(exercises).where(eq(exercises.slug, input.slug)).limit(1);
    if (!ex) return { ok: false, error: `Unknown slug '${input.slug}'. Use search_exercises.` };

    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
      .from(planExercises).where(eq(planExercises.planDayId, found.day.id));

    await db.insert(planExercises).values({
      planDayId: found.day.id,
      exerciseId: ex.id,
      sortOrder: n,
      targetSets: input.sets,
      targetReps: input.reps,
      targetWeightKg:
        input.weight === null || input.weight === undefined ? null : weightIn(input.weight, units),
      restSeconds: input.restSeconds ?? 90,
      notes: input.notes ?? null,
    });

    // A day that was rest is no longer rest once it has work in it.
    if (found.day.isRest) {
      await db.update(planDays).set({ isRest: false }).where(eq(planDays.id, found.day.id));
    }
    return { ok: true, added: ex.name, day: DAY_NAMES[found.dow] };
  },
});

export const removeExerciseFromDay = defineTool({
  name: "remove_exercise_from_day",
  description:
    "Drop one exercise from a day of the current plan. Sets she has already logged for it are kept — this only changes what is scheduled. Defaults to today.",
  input: z.object({
    slug: z.string(),
    dayOfWeek: z.number().optional().describe(
      "OMIT for today — that is almost always what she means. Only pass this when she names a different day. 0=Monday … 6=Sunday.",
    ),
    weekStart: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const found = await planDayFor(ctx.profileId, input);
    if ("error" in found) return { ok: false, error: found.error };

    const [ex] = await db.select({ id: exercises.id, name: exercises.name })
      .from(exercises).where(eq(exercises.slug, input.slug)).limit(1);
    if (!ex) return { ok: false, error: `Unknown slug '${input.slug}'.` };

    const removed = await db.delete(planExercises)
      .where(and(eq(planExercises.planDayId, found.day.id), eq(planExercises.exerciseId, ex.id)))
      .returning({ id: planExercises.id });

    if (removed.length === 0) {
      return { ok: false, error: `${ex.name} isn't scheduled on ${DAY_NAMES[found.dow]}.` };
    }
    return { ok: true, removed: ex.name, day: DAY_NAMES[found.dow] };
  },
});
