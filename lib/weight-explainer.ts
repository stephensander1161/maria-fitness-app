import { KCAL_PER_KG } from "@/lib/expenditure";

/**
 * Why the scale went up on a day she ate less than she burned.
 *
 * This is the single most common way someone concludes an app is not working
 * and stops using it, and it is entirely a units problem: a good day's
 * deficit is worth a few tens of grams of fat, and the scale moves a thousand
 * grams on water, glycogen and what is still in her gut. The reading is not
 * wrong and neither is the deficit — they are measuring different things at
 * different scales.
 *
 * So the arithmetic is shown at the moment the number appears, rather than
 * left for her to either work out or not. Two rules hold it up:
 *
 * 1. **It explains, it never congratulates.** "That deficit is worth about
 *    65g of fat" is arithmetic. "You lost fat yesterday" is a claim no single
 *    day can support, and the rest of this app refuses to make it.
 * 2. **A day that was not fully logged has no deficit to compare against.**
 *    Meals typed in words carry no calorie figure, and treating a partial
 *    day's total as her intake would invent a deficit she may not have run —
 *    which is exactly the bug `caloriesComplete` exists to prevent.
 */

/**
 * How much an ordinary day's weight moves on things that are not fat.
 *
 * Water alone accounts for most of it: a gram of glycogen holds three of
 * water, a salty meal shifts a kilo, and the food in transit is a kilo of its
 * own. Studies of daily weighing put the day-to-day standard deviation near
 * this, which is why one reading cannot see a day's deficit even in
 * principle.
 */
export const DAILY_NOISE_KG = 1.0;

export type ScaleReading = {
  /** Change since her previous weigh-in, in kg. Positive is up. Null if none. */
  changeKg: number | null;
  /** Days between the two readings. */
  daysApart: number | null;
  /**
   * Energy balance over those days, in kcal. Negative is a deficit.
   * Null when there is nothing trustworthy to compare against.
   */
  balanceKcal: number | null;
  /** Whether every meal in that span carried a calorie figure. */
  complete: boolean;
};

export type ScaleExplanation = {
  /** Fat the balance accounts for, in kg. Positive means fat lost. */
  fatKg: number;
  /** True when the reading moved less than the noise floor either way. */
  withinNoise: boolean;
  /** The one-line reason, written to her. */
  note: string;
};

/**
 * Null when there is nothing honest to say — no previous reading, or a span
 * that was not fully logged. Saying nothing is the correct output here; a
 * sentence assembled from a partial day is worse than silence.
 */
export function explainScaleMove(reading: ScaleReading): ScaleExplanation | null {
  const { changeKg, balanceKcal, complete, daysApart } = reading;
  if (changeKg === null || balanceKcal === null || !complete) return null;
  if (daysApart === null || daysApart <= 0) return null;

  const fatKg = -balanceKcal / KCAL_PER_KG;
  const noise = DAILY_NOISE_KG;
  const withinNoise = Math.abs(changeKg) <= noise;

  const grams = (kg: number) => `${Math.round(Math.abs(kg) * 1000)}g`;
  const span = daysApart === 1 ? "Yesterday" : `Over those ${daysApart} days`;

  // A deficit and the scale up. The case this exists for.
  if (fatKg > 0 && changeKg > 0) {
    return {
      fatKg,
      withinNoise,
      note: withinNoise
        ? `${span} you ate about ${Math.round(-balanceKcal)} under, which is roughly `
          + `${grams(fatKg)} of fat. The scale is up ${grams(changeKg)} — that is water and food `
          + `in transit, which move a kilo on an ordinary day. Both things are true.`
        : `${span} you ate about ${Math.round(-balanceKcal)} under, worth roughly `
          + `${grams(fatKg)} of fat, and the scale is up ${grams(changeKg)}. That is more than a `
          + `normal day's swing — usually salt, a big meal late, or a day off the usual routine. `
          + `The trend is what to read, not this.`,
    };
  }

  // A deficit and the scale down. Still not proof, and saying so is the point.
  if (fatKg > 0 && changeKg <= 0) {
    return {
      fatKg,
      withinNoise,
      note: `${span} you ate about ${Math.round(-balanceKcal)} under — roughly ${grams(fatKg)} `
        + `of fat — and the scale is down ${grams(changeKg)}. Most of that difference is water; `
        + `the fat part is the small, steady bit underneath it.`,
    };
  }

  // Ate at or above what she burned. Stated plainly, with no adjective.
  return {
    fatKg,
    withinNoise,
    note: `${span} you ate about ${Math.round(balanceKcal)} over what you burned, which is `
      + `roughly ${grams(fatKg)} either way. The scale ${changeKg >= 0 ? "is up" : "is down"} `
      + `${grams(changeKg)}, which on a single reading is mostly water.`,
  };
}

/** How many days of a deficit that size a single reading could hide. */
export function daysHiddenByNoise(balanceKcalPerDay: number): number | null {
  if (balanceKcalPerDay >= 0) return null;
  const fatKgPerDay = -balanceKcalPerDay / KCAL_PER_KG;
  if (fatKgPerDay <= 0) return null;
  return Math.round(DAILY_NOISE_KG / fatKgPerDay);
}
