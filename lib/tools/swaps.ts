import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  complaints, exercises, planDays, planExercises, plans, profiles, setLogs, workouts,
} from "@/lib/db/schema";
import { dayIndex, weekStart } from "@/lib/date";
import { todayForProfile } from "@/lib/profile";
import { owns } from "@/lib/templates";
import { equipmentToday } from "./phases";
import { defineTool } from "./define";

/**
 * The bench is taken, or her knee hurts.
 *
 * These are the two most common reasons a beginner abandons a session, and
 * both used to end in the coach improvising: it would name a movement without
 * checking she had the kit for it, or tell her to work around the pain, and
 * next week's plan would prescribe the same thing again because nothing
 * remembered.
 */

const REASONS = ["equipment_busy", "no_equipment", "pain", "too_hard", "too_easy", "prefer"] as const;

/** Rank the library for a movement she cannot do right now. */
async function candidatesFor(
  profileId: string,
  slug: string,
  reason: (typeof REASONS)[number],
) {
  const [target] = await db.select().from(exercises).where(eq(exercises.slug, slug)).limit(1);
  if (!target) return { error: `Unknown slug '${slug}'. Use search_exercises.` } as const;

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) return { error: "Profile not found." } as const;

  const kit = equipmentToday(profile, await todayForProfile(profileId)).equipment;
  const owned = kit.length ? kit : ["bodyweight"];
  const open = await db.select({ region: complaints.region, provokedBySlug: complaints.provokedBySlug })
    .from(complaints)
    .where(and(eq(complaints.profileId, profileId), isNull(complaints.resolvedOn)));

  const all = await db.select().from(exercises).where(ne(exercises.slug, slug));

  const named = new Set([...target.easierAlternatives, ...target.harderAlternatives]);
  const scored = all
    .filter((e) => e.equipment.length === 0 || e.equipment.some((kit) => owns(owned, kit)))
    // Never suggest something she has already said hurts.
    .filter((e) => !open.some((c) => c.provokedBySlug === e.slug))
    .map((e) => {
      const sharedMuscles = e.primaryMuscles.filter((m) => target.primaryMuscles.includes(m)).length;
      let score = sharedMuscles * 10;
      // The library's own easier/harder list is a human judgement about this
      // exact movement, and beats any similarity score we can compute.
      if (named.has(e.slug)) score += 25;
      if (e.category === target.category) score += 5;
      if (reason === "too_hard" && target.easierAlternatives.includes(e.slug)) score += 20;
      if (reason === "too_easy" && target.harderAlternatives.includes(e.slug)) score += 20;
      // A different pattern is the point when something hurts, and a liability
      // when the rack is simply busy.
      if (reason === "pain" && e.category === target.category) score -= 8;
      if (reason === "equipment_busy" && e.equipment.join() === target.equipment.join()) score -= 15;
      return { e, score, sharedMuscles };
    })
    .filter((c) => c.sharedMuscles > 0 || named.has(c.e.slug))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    target,
    openComplaints: open,
    options: scored.map((c) => ({
      slug: c.e.slug,
      name: c.e.name,
      worksInstead: c.e.primaryMuscles.join(", "),
      equipment: c.e.equipment.join(", ") || "bodyweight",
      easier: target.easierAlternatives.includes(c.e.slug),
      harder: target.harderAlternatives.includes(c.e.slug),
      safetyNote: c.e.safetyNote,
    })),
  } as const;
}

export const suggestSubstitutes = defineTool({
  name: "suggest_substitutes",
  description:
    "Alternatives for a movement she cannot do right now — the rack is busy, she has no bench today, it hurts, or it is too hard. Every option is filtered to equipment she actually has and excludes anything she has said hurts. Give her two, with what they work instead, and swap it with substitute_exercise once she picks.",
  input: z.object({
    slug: z.string(),
    reason: z.enum(REASONS).optional(),
  }),
  handler: async (input, ctx) => {
    const found = await candidatesFor(ctx.profileId, input.slug, input.reason ?? "prefer");
    if ("error" in found) return { ok: false, error: found.error };
    if (found.options.length === 0) {
      return {
        ok: false,
        error: `Nothing in the library covers ${found.target.name} with the equipment on file. Ask what she has to hand.`,
      };
    }
    return { ok: true, replacing: found.target.name, options: found.options };
  },
});

export const substituteExercise = defineTool({
  name: "substitute_exercise",
  description:
    "Swaps one movement for another in a day of her plan, keeping the sets, reps and rest. Use it the moment she says the machine is taken or something hurts — mid-session, that is the difference between a session she finishes and one she abandons. If the reason is pain, log_complaint as well, or next week's plan prescribes the same thing again.",
  input: z.object({
    slug: z.string().describe("The movement to replace"),
    withSlug: z.string().describe("What to put in its place — from suggest_substitutes"),
    reason: z.enum(REASONS).optional(),
    dayOfWeek: z.number().optional().describe("0=Monday; defaults to today"),
    weekStart: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const hers = await todayForProfile(ctx.profileId);
    const week = input.weekStart ?? weekStart(hers);
    const dow = input.dayOfWeek ?? dayIndex(hers);

    const [replacement] = await db.select().from(exercises)
      .where(eq(exercises.slug, input.withSlug)).limit(1);
    if (!replacement) return { ok: false, error: `Unknown slug '${input.withSlug}'. Use suggest_substitutes.` };

    const [plan] = await db.select({ id: plans.id }).from(plans)
      .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, week))).limit(1);
    if (!plan) return { ok: false, error: "No plan for that week yet." };
    const [day] = await db.select({ id: planDays.id }).from(planDays)
      .where(and(eq(planDays.planId, plan.id), eq(planDays.dayOfWeek, dow))).limit(1);
    if (!day) return { ok: false, error: "Nothing planned for that day." };

    const [row] = await db
      .select({ id: planExercises.id, name: exercises.name, targetWeightKg: planExercises.targetWeightKg })
      .from(planExercises)
      .innerJoin(exercises, eq(planExercises.exerciseId, exercises.id))
      .where(and(eq(planExercises.planDayId, day.id), eq(exercises.slug, input.slug)))
      .limit(1);
    if (!row) return { ok: false, error: `${input.slug} is not on that day. Call get_plan.` };

    // Sets, reps and rest carry across; the load does not. A different movement
    // at the same weight is a guess, and get_next_targets will work out a real
    // one from what she logs on it.
    await db.update(planExercises)
      .set({ exerciseId: replacement.id, targetWeightKg: null })
      .where(eq(planExercises.id, row.id));

    return {
      ok: true,
      replaced: row.name,
      with: replacement.name,
      dayOfWeek: dow,
      loadReset: row.targetWeightKg !== null,
      hint: input.reason === "pain"
        ? "Log the complaint too — otherwise next week's plan prescribes the same movement again."
        : "Call get_next_targets for a starting weight on the new movement.",
    };
  },
});

export const changeExercise = defineTool({
  name: "change_exercise",
  description:
    "Relabels a movement on a day, bringing every set she already logged against it along. Use it when the movement was named wrong rather than changed — she was doing V-ups and it went down as sit-ups, or she has just learned what the thing she does is actually called. substitute_exercise is the other case: she switched to something else part-way, and those earlier sets really were the old movement.",
  input: z.object({
    slug: z.string().describe("The movement as it is currently recorded"),
    toSlug: z.string().describe("What it should have been"),
    date: z.string().optional().describe("YYYY-MM-DD; defaults to her today"),
  }),
  handler: async (input, ctx) => {
    const hers = await todayForProfile(ctx.profileId);
    const on = input.date ?? hers;

    const [from] = await db.select().from(exercises).where(eq(exercises.slug, input.slug)).limit(1);
    const [to] = await db.select().from(exercises).where(eq(exercises.slug, input.toSlug)).limit(1);
    // Recoverable, so the model can search and try again rather than throwing.
    const unknownSlugs = [
      ...(from ? [] : [input.slug]),
      ...(to ? [] : [input.toSlug]),
    ];
    if (!from || !to) return { ok: false, unknownSlugs, error: "Use search_exercises for the right slug." };
    if (from.id === to.id) return { ok: false, error: "That is already the movement it is recorded as." };

    // The plan row for that day, if there is one. An exercise she added on the
    // spot has one too; an exercise from a week with no plan does not, and the
    // logged sets are still worth moving.
    const week = weekStart(on);
    const dow = dayIndex(on);
    const [row] = await db
      .select({ id: planExercises.id })
      .from(planExercises)
      .innerJoin(planDays, eq(planExercises.planDayId, planDays.id))
      .innerJoin(plans, eq(planDays.planId, plans.id))
      .where(and(
        eq(plans.profileId, ctx.profileId),
        eq(plans.weekStart, week),
        eq(planDays.dayOfWeek, dow),
        eq(planExercises.exerciseId, from.id),
      ))
      .limit(1);

    if (row) {
      // The target load carries across, unlike a substitution: this is the
      // same work under a different name, so the weight she was working to is
      // still the right weight.
      await db.update(planExercises).set({ exerciseId: to.id }).where(eq(planExercises.id, row.id));
    }

    // Her sets for that day, which are the whole point — a relabel that leaves
    // the history behind is the same as deleting it.
    const [session] = await db.select({ id: workouts.id }).from(workouts)
      .where(and(eq(workouts.profileId, ctx.profileId), eq(workouts.date, on)))
      .limit(1);

    const moved = session
      ? await db.update(setLogs)
          .set({ exerciseId: to.id })
          .where(and(eq(setLogs.workoutId, session.id), eq(setLogs.exerciseId, from.id)))
          .returning({ id: setLogs.id })
      : [];

    if (!row && moved.length === 0) {
      return { ok: false, error: `${from.name} is not on that day — nothing to change.` };
    }

    return {
      ok: true, was: from.name, now: to.name, date: on,
      setsMoved: moved.length,
      onPlan: row !== undefined,
    };
  },
});

export const logComplaint = defineTool({
  name: "log_complaint",
  description:
    "Records something that hurts — where, how bad out of ten, and what brought it on. Use it whenever she mentions pain, even in passing. The plan reads open complaints and works around them, which is the whole point: without this, next week prescribes the same movement and nobody remembers why she stopped. Sharp, joint-centred or lingering pain means see a professional, and you say so plainly.",
  input: z.object({
    region: z.string().describe("In her words: 'left knee', 'lower back'"),
    severity: z.number().min(0).max(10).optional(),
    provokedBySlug: z.string().optional().describe("The movement that brought it on"),
    note: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const today = await todayForProfile(ctx.profileId);

    // Same region already open: update it rather than stacking duplicates.
    const [open] = await db.select().from(complaints)
      .where(and(
        eq(complaints.profileId, ctx.profileId),
        isNull(complaints.resolvedOn),
        sql`lower(${complaints.region}) = ${input.region.trim().toLowerCase()}`,
      ))
      .limit(1);

    if (open) {
      const [updated] = await db.update(complaints).set({
        ...(input.severity === undefined ? {} : { severity: input.severity }),
        ...(input.provokedBySlug === undefined ? {} : { provokedBySlug: input.provokedBySlug }),
        ...(input.note === undefined ? {} : { note: input.note }),
      }).where(eq(complaints.id, open.id)).returning();
      const days = Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${updated.startedOn}T00:00:00Z`)) / 86_400_000,
      );
      return {
        ok: true, updated: true, region: updated.region, severity: updated.severity,
        goingOnFor: `${days} day${days === 1 ? "" : "s"}`,
        seeSomeone: days >= 14 || (updated.severity ?? 0) >= 7,
        hint: days >= 14 || (updated.severity ?? 0) >= 7
          ? "Say plainly that this needs a physiotherapist. Do not prescribe rehab."
          : "Work around it — swap the movement, never tell her to push through.",
      };
    }

    const [row] = await db.insert(complaints).values({
      profileId: ctx.profileId,
      region: input.region.trim(),
      severity: input.severity ?? null,
      provokedBySlug: input.provokedBySlug ?? null,
      note: input.note ?? null,
      startedOn: today,
    }).returning();

    return {
      ok: true, id: row.id, region: row.region, severity: row.severity,
      seeSomeone: (input.severity ?? 0) >= 7,
      hint: (input.severity ?? 0) >= 7
        ? "That is high. Say plainly that it needs looking at by a professional, and swap the movement meanwhile."
        : "Swap the movement it came from with substitute_exercise. Never tell her to push through.",
    };
  },
});

export const resolveComplaint = defineTool({
  name: "resolve_complaint",
  description:
    "Marks something as no longer bothering her, so the plan stops working around it. Use it when she says it has settled — otherwise the app keeps avoiding a movement she is fine with, indefinitely.",
  input: z.object({
    region: z.string().describe("As it was logged: 'left knee'"),
  }),
  handler: async (input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const [row] = await db.update(complaints)
      .set({ resolvedOn: today })
      .where(and(
        eq(complaints.profileId, ctx.profileId),
        isNull(complaints.resolvedOn),
        sql`lower(${complaints.region}) = ${input.region.trim().toLowerCase()}`,
      ))
      .returning();
    if (!row) return { ok: false, error: `Nothing open for "${input.region}".` };
    return { ok: true, region: row.region, since: row.startedOn };
  },
});

export const listComplaints = defineTool({
  name: "list_complaints",
  description:
    "What is currently bothering her, how long it has been going on, and what brought it on. Check it before planning a week or prescribing a movement. Anything open for a fortnight is a physiotherapist's job, not yours.",
  input: z.object({ includeResolved: z.boolean().optional() }),
  handler: async (input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const rows = await db.select().from(complaints)
      .where(input.includeResolved
        ? eq(complaints.profileId, ctx.profileId)
        : and(eq(complaints.profileId, ctx.profileId), isNull(complaints.resolvedOn)))
      .orderBy(desc(complaints.startedOn));

    return {
      open: rows.filter((r) => r.resolvedOn === null).map((r) => {
        const days = Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${r.startedOn}T00:00:00Z`)) / 86_400_000,
        );
        return {
          region: r.region, severity: r.severity, provokedBySlug: r.provokedBySlug,
          note: r.note, since: r.startedOn, days,
          seeSomeone: days >= 14 || (r.severity ?? 0) >= 7,
        };
      }),
      resolved: input.includeResolved
        ? rows.filter((r) => r.resolvedOn !== null)
            .map((r) => ({ region: r.region, from: r.startedOn, to: r.resolvedOn }))
        : undefined,
    };
  },
});

/** Open complaints as a line for the planner and the state block. */
export async function complaintSummary(profileId: string): Promise<string | null> {
  const rows = await db.select({ region: complaints.region, severity: complaints.severity, startedOn: complaints.startedOn })
    .from(complaints)
    .where(and(eq(complaints.profileId, profileId), isNull(complaints.resolvedOn)));
  if (rows.length === 0) return null;
  return `Currently bothering her: ${rows.map((r) =>
    `${r.region}${r.severity !== null ? ` (${r.severity}/10)` : ""} since ${r.startedOn}`,
  ).join("; ")}. Work around these — choose different movements, never tell her to push through.`;
}
