import { z } from "zod";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises, profiles, setLogs, weighIns, workouts } from "@/lib/db/schema";
import { addDays, type ISODate } from "@/lib/date";
import { weightLabel, weightOut } from "@/lib/units";
import { currentStreak, measurementProgress } from "@/lib/progress";
import { pickUnseenFact } from "@/lib/facts";
import { todayForProfile } from "@/lib/profile";
import { defineTool, type ToolContext } from "./define";

/**
 * A lift when she needs one.
 *
 * Deliberately built on her real numbers rather than pure affirmation. This app
 * tells her the truth when she comes up short, and that only means anything if
 * the encouragement is equally specific — "your waist is down two inches" lands
 * where "you've got this!" does not. The generic line is the frame; her data is
 * the substance. Where there is no data yet, the frame stands on its own.
 */

const OPENERS = [
  "You showed up.",
  "This is the part that counts.",
  "Still going.",
  "Nobody sees this bit. It's the bit that works.",
  "Small, repeated, boring. That's how it happens.",
  "You're doing the thing.",
  "Not motivation. Habit.",
  "The hard part is already behind you today.",
] as const;

type Evidence = { headline: string; detail?: string };

/** Whichever true thing about her is most worth hearing right now. */
async function findEvidence(ctx: ToolContext, asOf: ISODate): Promise<Evidence[]> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
  if (!profile) return [];
  const u = profile.units;
  const out: Evidence[] = [];

  const streak = await currentStreak(ctx.profileId, await todayForProfile(ctx.profileId));
  if (streak >= 2) {
    out.push({
      headline: `${streak} days in a row`,
      detail: "Consistency is the whole mechanism. You're running it.",
    });
  }

  const [latest] = await db.select().from(weighIns)
    .where(eq(weighIns.profileId, ctx.profileId)).orderBy(desc(weighIns.date)).limit(1);
  if (latest && profile.startWeightKg !== null) {
    const lost = weightOut(profile.startWeightKg - latest.weightKg, u);
    if (lost !== null && lost >= 0.5) {
      out.push({
        headline: `${lost}${weightLabel(u)} down from where you started`,
        detail: "That is gone, and it stays gone as long as you keep going.",
      });
    }
  }

  const sites = await measurementProgress(ctx.profileId, u);
  const waist = sites.find((s) => s.site === "waist");
  // Half an inch, or a centimetre — the smallest change a tape can be trusted on.
  const tapeNoise = u === "imperial" ? 0.5 : 1;
  if (waist?.changeTotal !== null && waist !== undefined && (waist.changeTotal ?? 0) <= -tapeNoise) {
    out.push({
      headline: `Waist down ${Math.abs(waist.changeTotal!)} ${u === "imperial" ? "inches" : "cm"}`,
      detail: "That's the measurement that matters most for health, and it's moving.",
    });
  }

  // Heaviest set in the last month, for a movement she has done before.
  const [best] = await db
    .select({ name: exercises.name, weightKg: setLogs.weightKg, reps: setLogs.reps })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(and(
      eq(workouts.profileId, ctx.profileId),
      gte(workouts.date, addDays(asOf, -30)),
      // Bodyweight sets carry no weight, and Postgres sorts NULLs first on
      // DESC — without this the "heaviest set" was always a plank.
      isNotNull(setLogs.weightKg),
    ))
    .orderBy(desc(setLogs.weightKg))
    .limit(1);
  if (best?.weightKg) {
    out.push({
      headline: `${best.name}: ${best.reps} at ${weightOut(best.weightKg, u)}${weightLabel(u)}`,
      detail: "Your heaviest set this month. Six weeks ago that was not happening.",
    });
  }

  const [{ sets }] = await db
    .select({ sets: sql<number>`count(*)::int` })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(eq(workouts.profileId, ctx.profileId));
  if (sets >= 10) {
    out.push({
      headline: `${sets} sets logged`,
      detail: "Every one of them was a decision to start.",
    });
  }

  return out;
}

export const getBoost = defineTool({
  name: "get_boost",
  description:
    "Pull together an encouragement built from her real numbers — a streak, weight or inches lost, her heaviest recent set — plus a fact she hasn't seen. Use it when she is flat, discouraged, or talking herself out of training, and say the numbers back to her rather than offering generic reassurance.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const asOf = await todayForProfile(ctx.profileId);
    const evidence = await findEvidence(ctx, asOf);
    const fact = await pickUnseenFact(ctx.profileId, await todayForProfile(ctx.profileId));

    return {
      // Rotates on the date so the same day is consistent but tomorrow differs.
      opener: OPENERS[new Date(asOf).getUTCDate() % OPENERS.length],
      evidence,
      fact: fact ? { text: fact.text, source: fact.source, category: fact.category } : null,
      hasData: evidence.length > 0,
    };
  },
});
