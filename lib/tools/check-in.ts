import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { mealLogs, mealPlans, measurements, profiles, weighIns } from "@/lib/db/schema";
import { energyFloorKcal, estimateBodyComposition } from "@/lib/body-composition";
import { addDays, weekStart } from "@/lib/date";
import { todayForProfile, ageFrom } from "@/lib/profile";
import { cmToIn, weightLabel, weightOut } from "@/lib/units";
import { estimateExpenditure, proposeTarget } from "@/lib/expenditure";
import { nutritionTargets, CALORIE_FLOOR } from "@/lib/nutrition";
import { defineTool } from "./define";

const WINDOW_DAYS = 21;

/**
 * The lowest intake her lean mass will tolerate, when the tape can tell us.
 *
 * Null rather than a guess when waist, hips or neck are missing — a floor
 * invented from a default body composition is exactly the kind of number that
 * should never quietly govern how little someone eats.
 */
async function leanMassFloor(profileId: string): Promise<number | null> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile?.heightCm) return null;

  const rows = await db.select().from(measurements)
    .where(eq(measurements.profileId, profileId))
    .orderBy(desc(measurements.date));
  const latest = new Map<string, number>();
  for (const r of rows) if (!latest.has(r.site)) latest.set(r.site, r.valueCm);

  const [waist, hip, neck] = [latest.get("waist"), latest.get("hips"), latest.get("neck")];
  if (waist === undefined || hip === undefined || neck === undefined) return null;

  const [weigh] = await db.select({ weightKg: weighIns.weightKg })
    .from(weighIns).where(eq(weighIns.profileId, profileId))
    .orderBy(desc(weighIns.date)).limit(1);
  const weightKg = weigh?.weightKg ?? profile.startWeightKg;
  if (weightKg === null) return null;

  const composition = estimateBodyComposition({
    waistCm: waist, hipCm: hip, neckCm: neck, heightCm: profile.heightCm, weightKg,
  });
  return composition ? energyFloorKcal(composition.fatFreeMassKg) : null;
}

/**
 * The weekly check-in: what she actually burns, and what to eat because of it.
 *
 * Mifflin-St Jeor set her first target and was wrong on day one — it is a
 * population regression, not her — and it gets wronger as she loses weight.
 * This measures instead, from her own intake and her own weight trend, and
 * refuses to guess when the data is too thin.
 *
 * Nothing here changes a target on its own. It proposes; she or the coach
 * accepts with set_nutrition_targets. An app that silently moves the number
 * she eats to is one she stops trusting.
 */
async function windowFor(profileId: string, asOf: string) {
  const from = addDays(asOf, -(WINDOW_DAYS - 1));

  const [logs, weights, profile] = await Promise.all([
    db.select({ date: mealLogs.date, calories: mealLogs.calories })
      .from(mealLogs)
      .where(and(
        eq(mealLogs.profileId, profileId),
        gte(mealLogs.date, from),
        lte(mealLogs.date, asOf),
      )),
    db.select({ date: weighIns.date, weightKg: weighIns.weightKg })
      .from(weighIns)
      .where(and(eq(weighIns.profileId, profileId), gte(weighIns.date, from)))
      .orderBy(weighIns.date),
    db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1).then((r) => r[0]),
  ]);

  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const date = addDays(from, i);
    const forDay = logs.filter((l) => l.date === date);
    const counted = forDay.filter((l) => l.calories !== null);
    return {
      date,
      calories: forDay.length ? counted.reduce((n, l) => n + (l.calories ?? 0), 0) : null,
      // The distinction the whole engine rests on: a day of "leftovers" is
      // logged, not counted, and must never be averaged in as a low day.
      caloriesComplete: forDay.length > 0 && counted.length === forDay.length,
    };
  });

  return { days, weights, profile, from };
}

export const runCheckIn = defineTool({
  name: "run_check_in",
  description:
    "Measures what she actually burns from her own intake and weight trend over the last three weeks, and proposes a calorie target from it — rather than the formula that set her first one, which was a population average on day one and drifts as she loses weight. Use it weekly, when she asks why the scale has stalled, or when she wants to eat more or less. It only proposes: call set_nutrition_targets to accept. When it says there is not enough data, say that and what would fix it; never fall back to guessing a number.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const asOf = await todayForProfile(ctx.profileId);
    const { days, weights, profile } = await windowFor(ctx.profileId, asOf);
    if (!profile) return { ok: false, error: "Profile not found." };

    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, weekStart(asOf))))
      .limit(1);

    const [latest] = await db.select({ weightKg: weighIns.weightKg })
      .from(weighIns).where(eq(weighIns.profileId, ctx.profileId))
      .orderBy(desc(weighIns.date)).limit(1);
    const weightKg = latest?.weightKg ?? profile.startWeightKg;

    const units = profile.units;
    const unit = weightLabel(units);
    const measured = estimateExpenditure(days, weights, asOf);

    if (measured.tdee === null) {
      return {
        ok: true,
        canMeasure: false,
        why: measured.why,
        daysCounted: measured.daysCounted,
        windowDays: measured.windowDays,
        currentTarget: plan?.calorieTarget ?? null,
        // Said plainly, because the alternative is an app that quietly lowers
        // her target because she had a busy fortnight.
        hint: "Do not change her target on this. Tell her what is missing — counted food days, or weigh-ins — and that nothing has changed until there are enough.",
      };
    }

    const age = ageFrom(profile.birthYear, asOf);
    if (weightKg === null || profile.heightCm === null || age === null) {
      return { ok: false, error: "Her height, age or weight is missing, so the floor cannot be computed." };
    }

    // The floor is her own resting burn, not a constant: eating under it costs
    // muscle, bone density and her cycle, and no rate of loss is worth that.
    const formula = nutritionTargets({
      weightKg,
      heightIn: units === "imperial" ? cmToIn(profile.heightCm) : profile.heightCm,
      age, sex: profile.sex ?? "female",
      daysPerWeek: profile.daysPerWeek ?? 3,
      units,
      goalWeightKg: profile.goalWeightKg,
    });
    const bmr = formula.maintenanceCalories / (profile.daysPerWeek && profile.daysPerWeek >= 4 ? 1.55 : 1.375);

    // Lean mass where the tape allows it, resting burn otherwise.
    const lean = await leanMassFloor(ctx.profileId);
    // The measurement says what she burns; her goal says which side of it to
    // land on. Without this the check-in proposed a deficit to someone who had
    // told the app they wanted to gain.
    const proposal = proposeTarget(measured.tdee, weightKg, Math.max(bmr, lean ?? 0), {
      direction: formula.direction,
    });
    const current = plan?.calorieTarget ?? null;

    return {
      ok: true,
      canMeasure: true,
      measuredExpenditure: measured.tdee,
      formulaSaid: formula.maintenanceCalories,
      basedOn: measured.why,
      daysCounted: measured.daysCounted,
      windowDays: measured.windowDays,
      meanIntake: measured.meanIntake,
      weightChange: weightOut(measured.weightChangeKg, units),
      weightUnit: unit,
      currentTarget: current,
      proposedTarget: proposal.calorieTarget,
      proposedProteinG: formula.proteinTargetG,
      // "0.5kg a week" is ambiguous the moment gaining is possible.
      expectedRate: proposal.direction === "hold"
        ? "steady"
        : `${weightOut(proposal.rateKgPerWeek, units)}${unit} a week ${proposal.direction === "gain" ? "on" : "off"}`,
      limitedBy: proposal.limitedBy,
      note: proposal.note,
      floor: Math.max(CALORIE_FLOOR, Math.round(bmr), lean ?? 0),
      floorFrom: lean !== null && lean >= bmr ? "lean mass" : "resting burn",
      hint: current === null
        ? "No target set for this week yet — offer the proposed one."
        : Math.abs(proposal.calorieTarget - current) < 75
          ? "Within 75 kcal of what she is already on: tell her it is holding up and change nothing."
          : "Offer the change and say what it is based on. Accept it with set_nutrition_targets only if she agrees.",
    };
  },
});

export const setNutritionTargets = defineTool({
  name: "set_nutrition_targets",
  description:
    "Sets the calorie and protein targets for a week without touching the meals she already has. Use it to accept what run_check_in proposed, or when she asks to eat more or less. Re-planning meals to change a number wipes every recipe already written for the week, so this is the tool for a target change and create_meal_plan is not. It will not go below what she burns at rest, whatever the number asked for.",
  input: z.object({
    calorieTarget: z.number(),
    proteinTargetG: z.number().optional(),
    weekStart: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const asOf = await todayForProfile(ctx.profileId);
    const week = input.weekStart ?? weekStart(asOf);
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };

    const [latest] = await db.select({ weightKg: weighIns.weightKg })
      .from(weighIns).where(eq(weighIns.profileId, ctx.profileId))
      .orderBy(desc(weighIns.date)).limit(1);
    const weightKg = latest?.weightKg ?? profile.startWeightKg;
    const age = ageFrom(profile.birthYear, asOf);

    // The floor is enforced here rather than in the caller, so no prompt and
    // no screen can talk it lower. Lean mass beats a BMR formula when the tape
    // can supply it: under about 30 kcal per kg of fat-free mass is low energy
    // availability, which costs bone density and menstrual function rather
    // than a slower week of fat loss.
    let floor = CALORIE_FLOOR;
    const lean = await leanMassFloor(ctx.profileId);
    if (weightKg !== null && profile.heightCm !== null && age !== null) {
      const formula = nutritionTargets({
        weightKg,
        heightIn: profile.units === "imperial" ? cmToIn(profile.heightCm) : profile.heightCm,
        age, sex: profile.sex ?? "female",
        daysPerWeek: profile.daysPerWeek ?? 3,
        units: profile.units,
      });
      floor = Math.max(
        CALORIE_FLOOR,
        Math.round(formula.maintenanceCalories / (profile.daysPerWeek && profile.daysPerWeek >= 4 ? 1.55 : 1.375)),
      );
    }
    if (lean !== null) floor = Math.max(floor, lean);

    const asked = Math.round(input.calorieTarget);
    const calorieTarget = Math.max(floor, asked);
    const proteinTargetG = input.proteinTargetG ?? (weightKg ? Math.round((weightKg * 1.6) / 5) * 5 : 100);

    const [existing] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, week))).limit(1);

    if (existing) {
      await db.update(mealPlans).set({ calorieTarget, proteinTargetG })
        .where(eq(mealPlans.id, existing.id));
    } else {
      await db.insert(mealPlans).values({
        profileId: ctx.profileId, weekStart: week, calorieTarget, proteinTargetG,
      });
    }

    return {
      ok: true,
      weekStart: week,
      calorieTarget,
      proteinTargetG,
      mealsKept: existing !== undefined,
      raisedToFloor: calorieTarget > asked,
      note: calorieTarget > asked
        ? `Asked for ${asked}; set to ${calorieTarget}, which is the floor — ${lean !== null && lean >= floor ? "thirty calories per kilo of her lean mass" : "what she burns at rest"}. Tell her that plainly: under it she loses muscle and bone, not fat.`
        : undefined,
      floorFrom: lean !== null && lean >= floor ? "lean mass" : "resting burn",
    };
  },
});
