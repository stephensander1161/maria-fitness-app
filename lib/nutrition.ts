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
  /**
   * Where she wants to end up. This decides whether the target is a deficit,
   * a surplus, or maintenance — see goalDirection.
   *
   * It used to be absent, and the consequence was not subtle: every target
   * this function produced was a deficit, so someone whose goal weight was
   * *above* their current weight was handed the exact opposite of what they
   * had asked for, on day one, with the app cheerfully calling it their plan.
   */
  goalWeightKg?: number | null;
};

/** Which way she is trying to go. */
export type GoalDirection = "lose" | "gain" | "hold";

/**
 * Losing, gaining, or holding.
 *
 * The band is a kilo either side, matching directionMatchesGoal: inside that,
 * "get to 70" and "stay at 70" are the same request, and the honest answer is
 * to eat at maintenance and let training change the composition. That case is
 * not a fudge — it is what most people mean by "build muscle", and prescribing
 * a deficit for it is how an app talks someone out of the thing they came for.
 */
export function goalDirection(
  currentKg: number,
  goalKg: number | null | undefined,
  bandKg = 1,
): GoalDirection {
  // No goal on file: this app is weight-loss-first, and a deficit is what
  // every caller got before goals were consulted at all. Stated rather than
  // implied, so the fallback is a decision and not an accident.
  if (goalKg === null || goalKg === undefined) return "lose";
  if (goalKg > currentKg + bandKg) return "gain";
  if (goalKg < currentKg - bandKg) return "lose";
  return "hold";
}

/** Below this, a plan stops being one she can live on. Never crossed. */
export const CALORIE_FLOOR = 1200;

export function nutritionTargets(input: TargetInput): {
  calorieTarget: number;
  proteinTargetG: number;
  maintenanceCalories: number;
  direction: GoalDirection;
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

  const direction = goalDirection(input.weightKg, input.goalWeightKg);

  // Around 0.75% of body weight per week — sustainable rather than fast, and
  // bounded so neither a very small nor a very large person gets an absurd one.
  const deficit = Math.min(750, Math.max(300, input.weightKg * 7.7));

  /**
   * A surplus is deliberately much smaller than the deficit, and that
   * asymmetry is the point rather than an oversight.
   *
   * Fat is lost about as fast as the deficit allows, but muscle is built at a
   * rate the body sets, and eating past that rate adds fat rather than
   * speeding anything up. ~0.25% of body weight a week is the usual
   * lean-gain figure; at 7700 kcal per kg that is roughly 2.75 kcal per kg of
   * her a day. Bounded at both ends for the same reason as the deficit.
   */
  const surplus = Math.min(450, Math.max(200, input.weightKg * 2.75));

  const rounded = (n: number) => Math.round(n / 10) * 10;
  const calorieTarget =
    direction === "gain" ? rounded(maintenance + surplus)
      // Holding is not "no plan": it is maintenance, which is what
      // recomposition actually asks for.
      : direction === "hold" ? rounded(maintenance)
        : Math.max(CALORIE_FLOOR, rounded(maintenance - deficit));

  // ~1.6g per kg. It protects muscle in a deficit and supports building it in
  // a surplus — the meta-analytic plateau sits around here either way, so the
  // number does not move with the direction and pretending otherwise would
  // just cost her money.
  const proteinTargetG = Math.round((input.weightKg * 1.6) / 5) * 5;

  return { calorieTarget, proteinTargetG, maintenanceCalories: Math.round(maintenance), direction };
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


/**
 * The protein in *her* portion, given a reference portion of the same food.
 *
 * Protein per calorie is a property of the food, so scaling by calories is
 * exact for one food and the best available guess for a described meal. It
 * exists because the alternative was worse: the app was building a query
 * string like "300 kcal cheese", which the portion parser reads as 300 of a
 * unit called "kcal" — no library match, and a fabricated syntax handed to
 * the model to make sense of. Ask for the food, do the arithmetic here.
 *
 * Returns null rather than a number when the scaling would be nonsense: no
 * reference calories to divide by, or a ratio so far from one that the two
 * portions cannot be the same food.
 */
export function proteinForCalories(
  referenceProteinG: number,
  referenceKcal: number,
  herKcal: number,
): number | null {
  if (!Number.isFinite(referenceKcal) || referenceKcal <= 0) return null;
  if (!Number.isFinite(herKcal) || herKcal <= 0) return null;
  const ratio = herKcal / referenceKcal;
  // A tenth to ten times covers every real portion of one food. Beyond that
  // something has gone wrong — a lookup that answered about something else,
  // or a calorie figure with a digit too many — and a wrong protein number
  // is worse than an empty box she fills in herself.
  if (ratio < 0.1 || ratio > 10) return null;
  return Math.round(referenceProteinG * ratio);
}
