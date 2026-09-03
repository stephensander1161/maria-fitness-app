/**
 * A body-fat estimate from a tape measure, and what it is actually for.
 *
 * Not the percentage. The percentage carries ±3-4 points of error against
 * hydrostatic weighing and depends entirely on where she put the tape, so the
 * absolute number is close to meaningless and is exactly the sort of figure
 * someone checks obsessively. What it is for is two things the app cannot get
 * any other way:
 *
 *   • **Fat-free mass**, which is what a safe calorie floor should be computed
 *     from. Sustained low energy availability — under ~30 kcal per kg of
 *     fat-free mass per day — costs bone density and menstrual function, and a
 *     floor built on that is a better floor than one built on a BMR formula.
 *   • **Change over time**, where the systematic error largely cancels. "You
 *     lost 2kg and kept your lean mass" is a true and useful sentence on a
 *     week when the scale has barely moved.
 *
 * So: the uncertainty travels with every number this returns, and callers are
 * expected to lead with the change rather than the level.
 */

export type TapeInput = {
  /** All in centimetres — storage is metric. */
  waistCm: number;
  hipCm: number;
  neckCm: number;
  heightCm: number;
  weightKg: number;
};

export type BodyComposition = {
  bodyFatPercent: number;
  fatFreeMassKg: number;
  fatMassKg: number;
  /** Plus or minus, in percentage points. Always stated. */
  uncertaintyPoints: number;
  method: "navy_tape";
};

/** The uncertainty is the honest part of this. */
export const BODY_FAT_UNCERTAINTY_POINTS = 4;

/**
 * US Navy circumference method, women's formula, in centimetres.
 *
 * The constant differs by unit and this is the metric one: −104.912 for
 * centimetres, −78.387 for inches. Using the inch constant on centimetre
 * measurements put a perfectly ordinary woman at 58% body fat — the first
 * test written against this caught it, which is the entire argument for
 * asserting that a plausible person gets a plausible number.
 *
 * Requires neck, and it is the measurement most likely to be missing — say so
 * rather than substituting a guess.
 */
export function estimateBodyComposition(input: TapeInput): BodyComposition | null {
  const { waistCm, hipCm, neckCm, heightCm, weightKg } = input;
  if ([waistCm, hipCm, neckCm, heightCm, weightKg].some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  // The log argument must be positive, and a neck larger than waist + hip is
  // a mis-measurement rather than a person.
  const girth = waistCm + hipCm - neckCm;
  if (girth <= 0) return null;

  const raw =
    163.205 * Math.log10(girth) - 97.684 * Math.log10(heightCm) - 104.912;

  // Outside this range the formula is not describing anyone; a tape held
  // differently is far likelier than a 5% or 60% reading.
  if (raw < 8 || raw > 60) return null;

  const bodFat = Math.round(raw * 10) / 10;
  const fatMassKg = Math.round(weightKg * (bodFat / 100) * 10) / 10;
  return {
    bodyFatPercent: bodFat,
    fatFreeMassKg: Math.round((weightKg - fatMassKg) * 10) / 10,
    fatMassKg,
    uncertaintyPoints: BODY_FAT_UNCERTAINTY_POINTS,
    method: "navy_tape",
  };
}

/**
 * The lowest daily intake that is not, over time, doing her harm.
 *
 * Energy availability is intake minus the energy spent training, per kilogram
 * of fat-free mass. Below about 30 kcal/kg FFM/day is clinical low energy
 * availability; the figure cited as comfortable for women is above 45.
 *
 * Training energy is deliberately left out — the app does not measure it, and
 * guessing it here would raise the floor on an invention. That makes this
 * floor *conservative in her favour* only in the sense that it is a hard
 * minimum: the coach should still treat anything near it as low.
 */
export function energyFloorKcal(fatFreeMassKg: number): number {
  return Math.round(30 * fatFreeMassKg);
}

/** How to describe a level that is mostly uncertainty. */
export function describeComposition(c: BodyComposition, weightKg: number): string {
  return (
    `About ${c.bodyFatPercent}% body fat by tape, give or take ${c.uncertaintyPoints} points — `
    + `that is roughly ${c.fatFreeMassKg}kg of lean mass on ${Math.round(weightKg * 10) / 10}kg. `
    + `The level is a rough figure and not worth watching; the change over months is the useful part, `
    + `because the error mostly cancels.`
  );
}
