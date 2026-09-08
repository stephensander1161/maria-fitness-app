/**
 * The ladder of weight milestones between where she started and where she
 * said she wants to be.
 *
 * A goal weight on its own is one number a long way off. Someone thirty
 * pounds out is told "thirty pounds to go" every single week for months, and
 * the only feedback the app gives is a bar that barely moves. The rungs are
 * what make the same journey answerable: five down is a thing that happens,
 * and it happens eight times on the way to forty.
 *
 * Two rules hold the whole file up.
 *
 * **Direction is never inferred here.** `goalDirection` in `lib/nutrition.ts`
 * is the one place that decides whether she is losing, gaining or holding,
 * and it is passed in. A second opinion computed from the sign of a
 * subtraction is exactly how this app once handed a deficit to someone who
 * had asked to gain — and a ladder pointing the wrong way would put "Down
 * 5 lb" in front of someone trying to put weight on.
 *
 * **A ladder always reaches the goal.** If the distance needs more rungs than
 * anyone wants to look at, the step *widens*; it is never truncated. A ladder
 * whose top rung is not the goal quietly redefines the goal as whatever the
 * ladder stopped at.
 */

import type { GoalDirection } from "@/lib/nutrition";
import type { Units } from "@/lib/units";

/**
 * How far apart the rungs are, in her display units.
 *
 * Five pounds and two kilos, which are close to the same distance and are
 * both the number people actually say out loud. Not a converted constant:
 * "Down 2.3 kg" is not a milestone anybody celebrates.
 */
export const LADDER_STEP: Record<Units, number> = { imperial: 5, metric: 2 };

/** Past this many, the step widens rather than the list growing. */
export const MAX_RUNGS = 10;

export type Rung = {
  /** The weight this rung sits at, in display units. */
  target: number;
  /** Distance from the start, display units, always positive. */
  moved: number;
  /** The last rung: her goal itself, rather than a marker on the way. */
  isGoal: boolean;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The rungs between a start weight and a goal, nearest first.
 *
 * Returns an empty ladder rather than a guess whenever one cannot honestly be
 * built: no start, no goal, or a direction of "hold" — where the goal *is*
 * roughly where she stands and the honest number of milestones between the
 * two is none.
 */
export function weightLadder(input: {
  startWeight: number | null | undefined;
  goalWeight: number | null | undefined;
  direction: GoalDirection;
  units: Units;
  /** Override the spacing, in display units. Her call, not a computed one. */
  step?: number;
}): Rung[] {
  const { startWeight: start, goalWeight: goal, direction, units } = input;
  if (start === null || start === undefined) return [];
  if (goal === null || goal === undefined) return [];
  if (direction === "hold") return [];

  // The direction decided elsewhere has to agree with the two numbers, or
  // there is nothing honest to build. This is not defensive tidying: a goal
  // of 160 from a start of 180 with a direction of "gain" is two sources
  // disagreeing about what she asked for, and picking either one silently is
  // how someone gets handed the opposite of their own request. Empty, and the
  // caller says it cannot build one.
  if (direction === "gain" && goal <= start) return [];
  if (direction === "lose" && goal >= start) return [];

  const distance = Math.abs(goal - start);
  const asked = input.step ?? LADDER_STEP[units];
  if (!(asked > 0) || !Number.isFinite(distance) || distance === 0) return [];

  // Widen rather than truncate. Whole multiples of the asked step, so the
  // rungs stay round numbers she would say out loud: 5, 10, 20 — never 6.7.
  let step = asked;
  while (distance / step > MAX_RUNGS) step += asked;

  // Sign, from the direction that was decided elsewhere.
  const sign = direction === "gain" ? 1 : -1;

  const rungs: Rung[] = [];
  for (let moved = step; moved < distance; moved += step) {
    rungs.push({ target: r1(start + sign * moved), moved: r1(moved), isGoal: false });
  }
  // The goal is always the top rung, and always exactly the goal — never the
  // last multiple of the step that happened to fit under it.
  rungs.push({ target: r1(goal), moved: r1(distance), isGoal: true });
  return rungs;
}

/** "Down 5 lb", "Up 2 kg", "Goal: 130 lb" — what the rung is called. */
export function rungTitle(rung: Rung, direction: GoalDirection, unitLabel: string): string {
  if (rung.isGoal) return `Goal: ${rung.target} ${unitLabel}`;
  return `${direction === "gain" ? "Up" : "Down"} ${rung.moved} ${unitLabel}`;
}

/**
 * Whether a rung has been reached, judged against the *trend*.
 *
 * Deliberately not against this morning's reading. A single weigh-in swings
 * a couple of pounds on water and salt, so a raw number crosses a rung and
 * uncrosses it a day later — and this app celebrates milestones out loud.
 * Congratulating someone on five pounds and then silently taking it back is
 * worse than waiting a few days to say it at all.
 */
export function rungReached(rung: Rung, trendWeight: number | null, direction: GoalDirection): boolean {
  if (trendWeight === null || !Number.isFinite(trendWeight)) return false;
  return direction === "gain" ? trendWeight >= rung.target : trendWeight <= rung.target;
}

/** The next rung she has not reached, or null when the ladder is finished. */
export function nextRung(rungs: Rung[], trendWeight: number | null, direction: GoalDirection): Rung | null {
  return rungs.find((r) => !rungReached(r, trendWeight, direction)) ?? null;
}

/**
 * How far she is along a rung, 0–1, for a progress bar.
 *
 * From the rung below it, not from the start: the bar is answering "how close
 * is the next one", and measured from the start every bar late in a long
 * ladder sits at 90% and never visibly moves.
 */
export function rungProgress(
  rungs: Rung[], target: Rung, trendWeight: number | null, startWeight: number | null,
): number | null {
  if (trendWeight === null || startWeight === null) return null;
  const i = rungs.indexOf(target);
  if (i === -1) return null;
  const from = i === 0 ? startWeight : rungs[i - 1].target;
  const span = target.target - from;
  if (span === 0) return null;
  const done = (trendWeight - from) / span;
  return Math.max(0, Math.min(1, done));
}
