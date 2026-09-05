import type { ISODate } from "@/lib/date";

/**
 * What a session probably cost her.
 *
 * Two things have to be said out loud, and both are structural rather than
 * decorative.
 *
 * **It is an estimate, and a rough one.** Metabolic equivalents are population
 * averages measured on other people. Two women of the same weight doing the
 * same session can differ by a third. Everything that renders this number says
 * "about", and nothing in the app makes a decision on it.
 *
 * **It must never be added to what she eats.** This is the trap that makes
 * fitness trackers useless: the app's real expenditure figure comes from
 * `lib/expenditure.ts`, measured from intake against weight change, and that
 * measurement *already includes* her training. Adding a burn estimate on top
 * would count the same session twice and hand her hundreds of imaginary
 * calories. So this number is shown, tracked, and celebrated — and it is
 * deliberately not wired into any target.
 */

/** Category defaults, used when a movement has no measured value of its own. */
const BY_CATEGORY: Record<string, number> = {
  compound: 6,
  isolation: 3.5,
  cardio: 8,
  core: 4,
  mobility: 2.5,
};

/** A set is not a minute. This is the working time one set actually takes. */
const SECONDS_PER_REP = 3;
/** Between sets she is still elevated, but not working. */
const REST_MET = 1.8;
const DEFAULT_REST_SECONDS = 90;

export type LoggedSet = {
  met: number | null;
  category: string;
  reps: number;
  holdSeconds: number | null;
  restSeconds?: number | null;
};

export const metFor = (s: { met: number | null; category: string }): number =>
  s.met ?? BY_CATEGORY[s.category] ?? 4;

/**
 * Kilocalories for one set, working time plus the rest that follows it.
 *
 * The formula is the standard one: METs × 3.5 × kg / 200 gives kcal per
 * minute. A hold is its own duration; a counted set is reps × a few seconds.
 */
export function burnForSet(set: LoggedSet, bodyWeightKg: number): number {
  const workingSeconds = set.holdSeconds ?? Math.max(0, set.reps) * SECONDS_PER_REP;
  const restSeconds = set.restSeconds ?? DEFAULT_REST_SECONDS;
  const perMinute = (met: number) => (met * 3.5 * bodyWeightKg) / 200;
  return (
    perMinute(metFor(set)) * (workingSeconds / 60) +
    perMinute(REST_MET) * (restSeconds / 60)
  );
}

export type SessionBurn = {
  /** Kilocalories, rounded. Always spoken about as "about". */
  kcal: number;
  sets: number;
  /** Minutes of working time plus rest, which is what she was in the gym for. */
  minutes: number;
  /**
   * How many of the sets had no measured cost of their own and fell back to a
   * category average. Carried rather than hidden — the same rule as fibre.
   */
  estimatedFrom: "measured" | "category-average" | "mixed";
};

export function burnForSession(sets: LoggedSet[], bodyWeightKg: number): SessionBurn {
  if (sets.length === 0) return { kcal: 0, sets: 0, minutes: 0, estimatedFrom: "category-average" };
  let kcal = 0;
  let seconds = 0;
  let measured = 0;
  for (const s of sets) {
    kcal += burnForSet(s, bodyWeightKg);
    seconds += (s.holdSeconds ?? Math.max(0, s.reps) * SECONDS_PER_REP) + (s.restSeconds ?? DEFAULT_REST_SECONDS);
    if (s.met !== null) measured += 1;
  }
  return {
    kcal: Math.round(kcal),
    sets: sets.length,
    minutes: Math.round(seconds / 60),
    estimatedFrom:
      measured === sets.length ? "measured" : measured === 0 ? "category-average" : "mixed",
  };
}

/** The line that goes next to every one of these numbers. */
export const BURN_CAVEAT =
  "An estimate from population averages, not a measurement. It is not added to what you can eat — the app works your intake out from your weight trend, which already includes your training.";

export type DailyBurn = { date: ISODate; kcal: number; sets: number };

/** Kilocalories a week, from days that had a session. Days with none are simply absent. */
export function weeklyBurn(days: DailyBurn[]): { total: number; sessions: number; perSession: number | null } {
  const trained = days.filter((d) => d.sets > 0);
  const total = trained.reduce((n, d) => n + d.kcal, 0);
  return {
    total,
    sessions: trained.length,
    // Null rather than zero when she has not trained: an average of no
    // sessions is not zero calories, it is not a number.
    perSession: trained.length === 0 ? null : Math.round(total / trained.length),
  };
}
