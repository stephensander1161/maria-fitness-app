/**
 * Where a lift sits, expressed only as the next rung.
 *
 * Strength standards are useful in exactly one direction: "you are 8kg off the
 * novice deadlift mark" is a target with a number on it. The same table shown
 * as a ladder puts a beginner at the bottom of five tiers on day one, which is
 * a worse thing to look at than no information at all — so this returns the
 * rung she is on and the next one, never the ladder.
 *
 * The ratios are bodyweight multiples, which has a quietly nice property
 * during a fat-loss phase: they improve as she loses weight even when the
 * absolute number is flat. That is real — relative strength is what carries
 * over to moving your own body around — and it is worth saying on a week when
 * the bar has not moved.
 */

export type Tier = "starting out" | "novice" | "intermediate" | "advanced";

/**
 * Bodyweight multiples by movement, for women. Deliberately a short list: a
 * standard invented for an exercise nobody publishes numbers for would be a
 * made-up target dressed as a fact.
 */
const RATIOS: Record<string, { novice: number; intermediate: number; advanced: number }> = {
  "barbell-back-squat": { novice: 0.75, intermediate: 1.25, advanced: 1.75 },
  "goblet-squat": { novice: 0.35, intermediate: 0.5, advanced: 0.7 },
  "barbell-deadlift": { novice: 1.0, intermediate: 1.5, advanced: 2.0 },
  "romanian-deadlift": { novice: 0.75, intermediate: 1.15, advanced: 1.6 },
  "barbell-bench-press": { novice: 0.5, intermediate: 0.75, advanced: 1.0 },
  "dumbbell-bench-press": { novice: 0.2, intermediate: 0.35, advanced: 0.5 },
  "overhead-press": { novice: 0.35, intermediate: 0.55, advanced: 0.75 },
  "barbell-row": { novice: 0.5, intermediate: 0.75, advanced: 1.0 },
  "hip-thrust": { novice: 1.0, intermediate: 1.5, advanced: 2.0 },
};

export const hasStandard = (slug: string) => slug in RATIOS;

export type StandardPlace = {
  tier: Tier;
  /** Her lift as a multiple of bodyweight, to two places. */
  ratio: number;
  /** Null when she is already at the top rung this table describes. */
  next: { tier: Tier; atKg: number; gapKg: number } | null;
};

/**
 * Where one lift sits. `oneRepMaxKg` should come from a *reliable* estimate —
 * an unreliable one placed against a standard is a number about her that
 * nobody actually measured.
 */
export function placeLift(slug: string, oneRepMaxKg: number, bodyweightKg: number): StandardPlace | null {
  const r = RATIOS[slug];
  if (!r || bodyweightKg <= 0 || oneRepMaxKg <= 0) return null;

  const ratio = Math.round((oneRepMaxKg / bodyweightKg) * 100) / 100;
  const rungs: { tier: Tier; at: number }[] = [
    { tier: "novice", at: r.novice },
    { tier: "intermediate", at: r.intermediate },
    { tier: "advanced", at: r.advanced },
  ];

  const passed = rungs.filter((x) => ratio >= x.at);
  const tier: Tier = passed.length ? passed[passed.length - 1].tier : "starting out";
  const upcoming = rungs.find((x) => ratio < x.at);

  return {
    tier,
    ratio,
    next: upcoming
      ? {
          tier: upcoming.tier,
          atKg: Math.round(upcoming.at * bodyweightKg * 10) / 10,
          gapKg: Math.round((upcoming.at * bodyweightKg - oneRepMaxKg) * 10) / 10,
        }
      : null,
  };
}
