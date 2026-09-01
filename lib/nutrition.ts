import { inToCm } from "@/lib/units";

/**
 * Starting calorie and protein targets, from her own numbers.
 *
 * Deliberately conservative: a deficit she can hold beats an aggressive one she
 * abandons, and the floor exists because below it a plan stops being something
 * anyone sustains. The coach adjusts from here once it sees how she responds.
 */
export type TargetInput = {
  weightKg: number;
  heightIn: number;
  age: number;
  sex: "female" | "male" | "other";
  daysPerWeek: number;
  units: "imperial" | "metric";
};

/** Below this, a plan stops being one she can live on. Never crossed. */
export const CALORIE_FLOOR = 1200;

export function nutritionTargets(input: TargetInput): {
  calorieTarget: number;
  proteinTargetG: number;
  maintenanceCalories: number;
} {
  const heightCm = input.units === "imperial" ? inToCm(input.heightIn) : input.heightIn;

  // Mifflin-St Jeor. "other" takes the lower constant, which errs toward a
  // smaller deficit rather than a larger one.
  const constant = input.sex === "male" ? 5 : -161;
  const bmr = 10 * input.weightKg + 6.25 * heightCm - 5 * input.age + constant;

  // Lightly active: a few training days plus ordinary life. Not an athlete
  // multiplier, because assuming she moves more than she does inflates the
  // target and stalls the deficit.
  const maintenance = bmr * (input.daysPerWeek >= 4 ? 1.55 : 1.375);

  // Around 0.75% of body weight per week — sustainable rather than fast, and
  // bounded so neither a very small nor a very large person gets an absurd one.
  const deficit = Math.min(750, Math.max(300, input.weightKg * 7.7));

  const calorieTarget = Math.max(CALORIE_FLOOR, Math.round((maintenance - deficit) / 10) * 10);

  // ~1.6g per kg protects muscle during a deficit; past that the benefit
  // plateaus and it only costs money.
  const proteinTargetG = Math.round((input.weightKg * 1.6) / 5) * 5;

  return { calorieTarget, proteinTargetG, maintenanceCalories: Math.round(maintenance) };
}

/**
 * Daily fibre target, in grams.
 *
 * The UK guideline for adults (SACN, carried by the NHS) is 30g. It is a
 * population figure rather than something computed from her body, which is why
 * it is a constant here and not part of nutritionTargets — presenting it as a
 * personalised number would overstate what it is.
 *
 * It earns its place in a weight-loss app for one reason: fibre is the cheapest
 * satiety there is, and a deficit she does not feel is a deficit she keeps.
 */
export const FIBRE_TARGET_G = 30;

/**
 * A day's fibre, and how much of the day it actually covers.
 *
 * Fibre is only known for food logged through the calculator, because that is
 * the only path that resolves a real portion against the library. A meal
 * described in words carries no fibre figure at all. Summing what we have and
 * calling it "today's fibre" would under-report every day she typed a sentence,
 * and read as failure at something she may well have done fine.
 *
 * So the count travels with the number, and anything presenting it must say
 * which it is.
 */
export function fibreForDay(
  logs: { fibreG: number | null }[],
): { grams: number; knownFor: number; unknownFor: number; complete: boolean } {
  const known = logs.filter((l) => l.fibreG !== null);
  return {
    grams: known.reduce((n, l) => n + (l.fibreG ?? 0), 0),
    knownFor: known.length,
    unknownFor: logs.length - known.length,
    complete: logs.length > 0 && known.length === logs.length,
  };
}

export type TargetDirection = "deficit" | "maintenance" | "surplus";

/**
 * Whether a chosen calorie target actually points where she is trying to go.
 *
 * create_meal_plan takes its target from the model, and had only a floor: any
 * number above 1200 was accepted. A surplus set for someone trying to lose is
 * not a rounding error, it is the opposite of the plan, and nothing in the app
 * would have noticed. This does not clamp the number — a surplus is right when
 * it is what she asked for — it just makes the direction impossible to miss.
 *
 * The band is ±8% of maintenance, wide enough that ordinary estimation noise
 * does not get called a surplus.
 */
export function targetDirection(target: number, maintenance: number): TargetDirection {
  const ratio = target / maintenance;
  if (ratio > 1.08) return "surplus";
  if (ratio < 0.92) return "deficit";
  return "maintenance";
}

/**
 * Does the direction of the target match the direction of her goal weight?
 * Returns null when we cannot tell — no goal set, or no current weight.
 */
export function directionMatchesGoal(
  direction: TargetDirection,
  currentKg: number | null,
  goalKg: number | null,
): boolean | null {
  if (currentKg === null || goalKg === null) return null;
  // Within a kilo of goal, holding steady is the right answer.
  if (Math.abs(goalKg - currentKg) < 1) return direction === "maintenance";
  return goalKg < currentKg ? direction === "deficit" : direction === "surplus";
}
