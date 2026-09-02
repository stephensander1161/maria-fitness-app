/**
 * Reading her cycle against her weight, and nothing more.
 *
 * The one job worth doing here: a rise on the scale in the week before a
 * period is fluid, and an app that reports it as a gain has told her she
 * failed at something she did not. Naming it costs nothing and removes the
 * most common false failure signal this kind of app produces.
 *
 * What this deliberately does not do is prescribe. Phase-based training
 * programmes are ahead of the evidence — the umbrella reviews find no reliable
 * effect of cycle phase on strength or adaptation — and telling a beginner she
 * is fragile on a schedule is a real cost against a benefit nobody has shown.
 */

import { addDays, daysBetween, type ISODate } from "./date";

export type Period = { start: ISODate; end: ISODate | null };

/** Typical luteal length; the window where fluid retention shows up. */
const PREMENSTRUAL_DAYS = 7;

export type CyclePhase = {
  /** Days since the last period started, or null when nothing is logged. */
  dayOfCycle: number | null;
  /** Median length of her recent cycles, once there are two to measure. */
  typicalLength: number | null;
  /** True in the week before her next expected period. */
  premenstrual: boolean;
  /** True while a period is logged as running. */
  bleeding: boolean;
};

export function cyclePhase(periods: Period[], asOf: ISODate): CyclePhase {
  const starts = [...periods].map((p) => p.start).sort();
  if (starts.length === 0) {
    return { dayOfCycle: null, typicalLength: null, premenstrual: false, bleeding: false };
  }

  const last = [...starts].reverse().find((d) => d <= asOf) ?? null;
  const dayOfCycle = last === null ? null : daysBetween(last, asOf) + 1;

  // Median rather than mean: one long cycle after an illness should not drag
  // the estimate for months.
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) gaps.push(daysBetween(starts[i - 1], starts[i]));
  const recent = gaps.slice(-6).filter((g) => g >= 18 && g <= 45).sort((a, b) => a - b);
  const typicalLength = recent.length >= 2 ? recent[Math.floor(recent.length / 2)] : null;

  const current = periods.find((p) => p.start === last);
  const bleeding = current !== undefined
    && current.start <= asOf
    && (current.end === null ? daysBetween(current.start, asOf) <= 7 : current.end >= asOf);

  const premenstrual =
    typicalLength !== null && dayOfCycle !== null
    && dayOfCycle > typicalLength - PREMENSTRUAL_DAYS
    && dayOfCycle <= typicalLength + 3
    && !bleeding;

  return { dayOfCycle, typicalLength, premenstrual, bleeding };
}

/**
 * What to say about a weight change, given where she is.
 *
 * Returns null when there is nothing worth saying — which is most of the time.
 * A caveat on every reading would be its own kind of noise.
 */
export function weightCaveat(
  phase: CyclePhase,
  weeklyChangeKg: number | null,
): string | null {
  if (!phase.premenstrual && !phase.bleeding) return null;
  // Only when the scale is up or flat. A drop needs no excuse, and offering
  // one implies the number is the point.
  if (weeklyChangeKg !== null && weeklyChangeKg < -0.1) return null;

  return phase.bleeding
    ? "She is on her period. Fluid shifts of a kilo or more are ordinary this week — if the scale is up or flat, say that plainly before anything else, and do not read it as a stall."
    : "She is in the week before her period is due. A rise of a kilo or more here is water, not fat. Say so before she reads it as a gain — this is the most common way an app like this tells a woman she has failed at something she has not.";
}

/** Days her next period is likely to start, once there is enough history. */
export function nextExpected(periods: Period[], asOf: ISODate): ISODate | null {
  const phase = cyclePhase(periods, asOf);
  const starts = [...periods].map((p) => p.start).sort();
  const last = [...starts].reverse().find((d) => d <= asOf);
  if (!last || phase.typicalLength === null) return null;
  return addDays(last, phase.typicalLength);
}
