import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  exercises, mealPlans, planDays, planExercises, plans, profiles, setLogs, workouts,
} from "@/lib/db/schema";
import { addDays, weekStart } from "@/lib/date";
import { todayForProfile } from "@/lib/profile";
import { movementStatus, readProgress } from "@/lib/deload";
import type { Session } from "@/lib/progression-math";
import { defineTool } from "./define";

/** Every movement she has trained recently, with its sessions. */
async function recentHistory(profileId: string, sinceDays = 56) {
  const since = addDays(await todayForProfile(profileId), -sinceDays);
  const rows = await db
    .select({
      slug: exercises.slug, name: exercises.name, exerciseId: exercises.id,
      date: workouts.date, reps: setLogs.reps, weightKg: setLogs.weightKg, rir: setLogs.rir,
    })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(and(eq(workouts.profileId, profileId)))
    .orderBy(desc(workouts.date));

  const byMovement = new Map<string, { name: string; sessions: Map<string, Session> }>();
  for (const r of rows) {
    if (r.date < since) continue;
    const m = byMovement.get(r.slug) ?? { name: r.name, sessions: new Map() };
    const session = m.sessions.get(r.date) ?? { date: r.date, sets: [] };
    session.sets.push({ reps: r.reps, weightKg: r.weightKg, rir: r.rir });
    m.sessions.set(r.date, session);
    byMovement.set(r.slug, m);
  }
  return byMovement;
}

export const checkProgressionStatus = defineTool({
  name: "check_progression_status",
  description:
    "Which movements have stopped moving, which are costing more effort for the same weight, and whether a lighter week is worth proposing. Use it when she asks why she is not getting stronger, when the scale and the lifts both look flat, or before rebuilding a week. The `explanation` is the important part and it is written to be said almost verbatim: a stall in a deficit is the plan working, not her failing, and a flat line with no explanation is the week people decide it isn't working and stop.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const history = await recentHistory(ctx.profileId);
    if (history.size === 0) {
      return { ok: true, movements: [], suggestDeload: false, explanation: "Nothing logged recently to read." };
    }

    // The rep target the plan actually asks for, where there is one.
    const week = weekStart(await todayForProfile(ctx.profileId));
    const [plan] = await db.select({ id: plans.id }).from(plans)
      .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, week))).limit(1);
    const targets = new Map<string, number>();
    if (plan) {
      const days = await db.select({ id: planDays.id }).from(planDays).where(eq(planDays.planId, plan.id));
      if (days.length) {
        const items = await db
          .select({ slug: exercises.slug, reps: planExercises.targetReps })
          .from(planExercises)
          .innerJoin(exercises, eq(planExercises.exerciseId, exercises.id))
          .where(inArray(planExercises.planDayId, days.map((d) => d.id)));
        for (const i of items) targets.set(i.slug, i.reps);
      }
    }

    const statuses = [...history.entries()].map(([slug, m]) =>
      movementStatus(slug, m.name, [...m.sessions.values()], targets.get(slug) ?? 10));

    // Whether she is eating at a deficit decides the sentence, not the maths.
    const [mealPlan] = await db.select({ calorieTarget: mealPlans.calorieTarget })
      .from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, week))).limit(1);
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    const inDeficit = mealPlan !== undefined
      && profile?.goalWeightKg !== null && profile?.startWeightKg !== null
      && (profile?.goalWeightKg ?? 0) < (profile?.startWeightKg ?? 0);

    const verdict = readProgress(statuses, { inDeficit, weeksTraining: null });

    return {
      ok: true,
      movements: statuses
        .filter((s) => s.stalled || s.rirCreep)
        .map((s) => ({
          name: s.name, slug: s.slug, sessions: s.sessions,
          sameWeightFor: s.repeatedAtLoad, sessionsSinceBest: s.sessionsSinceBest,
          gettingHarder: s.rirCreep,
        })),
      stillMoving: statuses.filter((s) => !s.stalled && !s.rirCreep).map((s) => s.name),
      suggestDeload: verdict.suggestDeload,
      explanation: verdict.explanation,
      hint: verdict.suggestDeload
        ? "Offer schedule_deload for next week. Say what it is: same movements, half the sets, same weight."
        : undefined,
    };
  },
});

export const scheduleDeload = defineTool({
  name: "schedule_deload",
  description:
    "Writes a lighter week: the same movements at the same weights, with the sets halved. Use it when check_progression_status suggests one, or when she says she is beaten up. Tell her what it is for — a week of less work is how the last few weeks' work actually turns into strength, and it is not a week off.",
  input: z.object({
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to next week"),
    fromWeekStart: z.string().optional().describe("The week to lighten; defaults to this one"),
  }),
  handler: async (input, ctx) => {
    const hers = await todayForProfile(ctx.profileId);
    const from = input.fromWeekStart ?? weekStart(hers);
    const to = input.weekStart ?? addDays(weekStart(hers), 7);

    const [source] = await db.select().from(plans)
      .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, from))).limit(1);
    if (!source) return { ok: false, error: `No training plan for the week of ${from} to lighten.` };

    const days = await db.select().from(planDays).where(eq(planDays.planId, source.id));
    const items = days.length
      ? await db.select().from(planExercises)
          .where(inArray(planExercises.planDayId, days.map((d) => d.id)))
      : [];

    let movements = 0;
    await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: plans.id }).from(plans)
        .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, to))).limit(1);
      if (existing) await tx.delete(plans).where(eq(plans.id, existing.id));

      const [deload] = await tx.insert(plans).values({
        profileId: ctx.profileId, weekStart: to,
        title: "Deload week",
        rationale:
          "Same movements, same weights, half the sets. A lighter week is where the last few weeks' "
          + "training actually becomes strength — it is not a week off, and it is not falling behind.",
      }).returning();

      for (const day of days) {
        const [newDay] = await tx.insert(planDays).values({
          planId: deload.id, dayOfWeek: day.dayOfWeek, title: day.title,
          focus: day.focus, isRest: day.isRest, notes: day.notes,
        }).returning();
        const forDay = items.filter((i) => i.planDayId === day.id);
        if (forDay.length === 0) continue;
        movements += forDay.length;
        await tx.insert(planExercises).values(forDay.map((i) => ({
          planDayId: newDay.id, exerciseId: i.exerciseId,
          // Half the sets, minimum one. The weight is deliberately unchanged:
          // dropping it as well makes the week feel like going backwards.
          targetSets: Math.max(1, Math.round(i.targetSets / 2)),
          targetReps: i.targetReps,
          targetWeightKg: i.targetWeightKg,
          restSeconds: i.restSeconds, notes: i.notes, sortOrder: i.sortOrder,
        })));
      }
    });

    return {
      ok: true, weekStart: to, from, movements,
      note: "Same movements and weights, half the sets. Tell her it is a week of less work on purpose.",
    };
  },
});
