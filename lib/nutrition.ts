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

  return { calorieTarget, proteinTargetG };
}
