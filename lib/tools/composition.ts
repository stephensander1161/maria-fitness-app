import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { exercises, measurements, profiles, weighIns } from "@/lib/db/schema";
import { weightLabel, weightOut } from "@/lib/units";
import {
  describeComposition, energyFloorKcal, estimateBodyComposition, type BodyComposition,
} from "@/lib/body-composition";
import { hasStandard, placeLift } from "@/lib/strength-standards";
import { defineTool } from "./define";

/** Her most recent reading at each site, and the oldest set for comparison. */
async function tapeFor(profileId: string) {
  const rows = await db.select().from(measurements)
    .where(eq(measurements.profileId, profileId))
    .orderBy(desc(measurements.date));

  const latest = new Map<string, { value: number; date: string }>();
  const earliest = new Map<string, { value: number; date: string }>();
  for (const r of rows) {
    if (!latest.has(r.site)) latest.set(r.site, { value: r.valueCm, date: r.date });
    earliest.set(r.site, { value: r.valueCm, date: r.date });
  }
  return { latest, earliest };
}

async function compositionAt(
  profileId: string,
  which: "latest" | "earliest",
): Promise<{ composition: BodyComposition; date: string; weightKg: number } | null> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile?.heightCm) return null;

  const tape = (await tapeFor(profileId))[which];
  const waist = tape.get("waist");
  const hip = tape.get("hips");
  const neck = tape.get("neck");
  if (!waist || !hip || !neck) return null;

  const date = [waist.date, hip.date, neck.date].sort()[which === "latest" ? 2 : 0];
  const [weigh] = await db.select({ weightKg: weighIns.weightKg, date: weighIns.date })
    .from(weighIns).where(eq(weighIns.profileId, profileId))
    .orderBy(desc(weighIns.date)).limit(1);
  const weightKg = weigh?.weightKg ?? profile.startWeightKg;
  if (weightKg === null) return null;

  const composition = estimateBodyComposition({
    waistCm: waist.value, hipCm: hip.value, neckCm: neck.value,
    heightCm: profile.heightCm, weightKg,
  });
  return composition ? { composition, date, weightKg } : null;
}

export const estimateBodyComp = defineTool({
  name: "estimate_body_composition",
  description:
    "A rough body-fat estimate from her tape measurements, and the lean mass that comes with it. Lead with the change over time, never the level: the figure carries about four percentage points of error and depends on where the tape sat, so the absolute number is nearly meaningless while the direction over months is real. Its actual job is lean mass — the safe floor on how little she should eat is computed from it. Needs waist, hips and neck; say which is missing rather than working around it.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };
    if (!profile.heightCm) return { ok: false, error: "Her height is not on file, and the estimate needs it." };

    const { latest } = await tapeFor(ctx.profileId);
    const missing = ["waist", "hips", "neck"].filter((s) => !latest.has(s));
    if (missing.length) {
      return {
        ok: false,
        missing,
        error: `Needs ${missing.join(", ")} measured. Ask for ${missing.length === 1 ? "that one" : "those"} — get_measuring_guide has how to take ${missing.length === 1 ? "it" : "them"}.`,
      };
    }

    const now = await compositionAt(ctx.profileId, "latest");
    if (!now) return { ok: false, error: "Those measurements do not add up to a person — worth re-taking." };
    const then = await compositionAt(ctx.profileId, "earliest");

    const u = profile.units;
    const changed = then && then.date !== now.date
      ? {
          since: then.date,
          bodyFatPoints: Math.round((now.composition.bodyFatPercent - then.composition.bodyFatPercent) * 10) / 10,
          leanMassChange: weightOut(now.composition.fatFreeMassKg - then.composition.fatFreeMassKg, u),
          fatMassChange: weightOut(now.composition.fatMassKg - then.composition.fatMassKg, u),
        }
      : null;

    return {
      ok: true,
      bodyFatPercent: now.composition.bodyFatPercent,
      uncertaintyPoints: now.composition.uncertaintyPoints,
      leanMass: weightOut(now.composition.fatFreeMassKg, u),
      fatMass: weightOut(now.composition.fatMassKg, u),
      unit: weightLabel(u),
      measuredOn: now.date,
      // The sentence worth saying on a week when the scale has not moved.
      change: changed,
      howToSayIt: describeComposition(now.composition, now.weightKg),
      lowestSafeIntake: energyFloorKcal(now.composition.fatFreeMassKg),
      note: "Under that intake is low energy availability — bone density and her cycle, not a slower week. set_nutrition_targets will not go below it.",
    };
  },
});

export const getStrengthStandard = defineTool({
  name: "get_strength_standard",
  description:
    "Where a lift sits as a multiple of her bodyweight, and what the next mark is. Use it to set a milestone worth chasing or to answer 'is that any good?' — always as the next rung and the gap to it, never as a ladder with her at the bottom of it. Only covers the movements standards actually exist for. Note the quietly good part for a fat-loss phase: the ratio improves as she loses weight even when the bar has not moved, and that is real.",
  input: z.object({
    slug: z.string(),
    oneRepMax: z.number().optional().describe("Her units. Omit to use the estimate from her logs."),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };
    if (!hasStandard(input.slug)) {
      const [ex] = await db.select({ name: exercises.name }).from(exercises)
        .where(eq(exercises.slug, input.slug)).limit(1);
      return {
        ok: false,
        error: `There is no published standard for ${ex?.name ?? input.slug}, and inventing one would be a made-up target dressed as a fact. The big lifts have them.`,
      };
    }

    const [weigh] = await db.select({ weightKg: weighIns.weightKg })
      .from(weighIns).where(eq(weighIns.profileId, ctx.profileId))
      .orderBy(desc(weighIns.date)).limit(1);
    const bodyweightKg = weigh?.weightKg ?? profile.startWeightKg;
    if (bodyweightKg === null) return { ok: false, error: "No weigh-in on file to compare against." };

    let oneRepMaxKg: number | null = null;
    let reliable = true;
    if (input.oneRepMax !== undefined) {
      oneRepMaxKg = profile.units === "imperial" ? input.oneRepMax * 0.45359237 : input.oneRepMax;
    } else {
      const estimate = await estimateFromLogs(ctx.profileId, input.slug);
      oneRepMaxKg = estimate?.kg ?? null;
      reliable = estimate?.reliable ?? false;
    }
    if (oneRepMaxKg === null) {
      return { ok: false, error: "Nothing logged on that movement with a weight yet." };
    }

    const place = placeLift(input.slug, oneRepMaxKg, bodyweightKg);
    if (!place) return { ok: false, error: "Could not place that." };

    const u = profile.units;
    return {
      ok: true,
      tier: place.tier,
      bodyweightMultiple: place.ratio,
      // Said plainly: an estimate that is not reliable should not be placed
      // against a standard as though someone measured it.
      estimateIsReliable: reliable,
      next: place.next
        ? {
            tier: place.next.tier,
            at: weightOut(place.next.atKg, u),
            away: weightOut(place.next.gapKg, u),
            unit: weightLabel(u),
          }
        : null,
      hint: place.next
        ? "Give her the next mark and the gap. Never list the tiers above it."
        : "She is past the top of the published table for this lift — say so and leave it there.",
    };
  },
});

/** The best reliable one-rep-max estimate from her own sets. */
async function estimateFromLogs(profileId: string, slug: string) {
  const { sessionBest } = await import("@/lib/progression-math");
  const { setLogs, workouts } = await import("@/lib/db/schema");
  const [ex] = await db.select({ id: exercises.id }).from(exercises)
    .where(eq(exercises.slug, slug)).limit(1);
  if (!ex) return null;

  const rows = await db
    .select({ date: workouts.date, reps: setLogs.reps, weightKg: setLogs.weightKg, rir: setLogs.rir })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(and(eq(workouts.profileId, profileId), eq(setLogs.exerciseId, ex.id)))
    .orderBy(desc(workouts.date))
    .limit(40);
  if (rows.length === 0) return null;

  const byDate = new Map<string, { reps: number; weightKg: number | null; rir: number | null }[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

  let best: { kg: number; reliable: boolean } | null = null;
  for (const [date, sets] of byDate) {
    const b = sessionBest({ date, sets });
    if (b && (!best || b.kg > best.kg)) best = { kg: b.kg, reliable: b.reliable };
  }
  return best;
}
