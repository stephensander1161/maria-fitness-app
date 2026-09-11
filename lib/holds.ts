/**
 * A hold is measured in seconds, and the screen has to say so.
 *
 * `exercises.is_hold` and `set_logs.hold_seconds` have been right since holds
 * were added: `log_set` refuses reps for a hold, volume ignores them so a wall
 * sit contributes no tonnage, and the burn model reads the seconds directly.
 * The card was the half that never got the message — it asked for "Reps" and
 * "Weight" on a plank, which is the app not understanding the movement, and
 * that is the exact complaint that got holds built in the first place.
 *
 * One place decides, so the entry card, the set editor and the "last time"
 * line cannot drift apart again.
 */
export type CountField = {
  label: string;
  step: number;
  min: number;
  max: number;
  decimals: boolean;
  /** A sensible figure to open on when there is nothing to carry forward. */
  fallback: number;
};

export function countField(isHold: boolean): CountField {
  return isHold
    // Five-second steps: nobody holds a plank for forty-one seconds, and a
    // stepper that moves by one needs twelve taps to get anywhere useful.
    ? { label: "Seconds", step: 5, min: 5, max: 1800, decimals: false, fallback: 30 }
    // Halves accepted by typing for the set she got part-way through, but the
    // buttons move by whole reps, because that is what a rep is.
    : { label: "Reps", step: 1, min: 0.5, max: 500, decimals: true, fallback: 8 };
}

/** "45s" or "8". Never "45 reps" of something nobody repeats. */
export const formatCount = (n: number, isHold: boolean): string =>
  isHold ? `${Math.round(n)}s` : String(n);

/**
 * One logged set, as the card writes it: "8@30", "45s", "45s@10".
 *
 * Holds render the seconds where the reps go rather than gaining a column —
 * they are the same fact in the same place, measured differently.
 */
export function describeSet(
  set: { reps: number; weight: number | null; holdSeconds?: number | null },
  isHold: boolean,
): string {
  const count = isHold ? formatCount(set.holdSeconds ?? set.reps, true) : String(set.reps);
  return set.weight !== null ? `${count}@${set.weight}` : count;
}

/**
 * What she actually did, in a line.
 *
 * A folded card showed its *target*, which is the one number on it she does
 * not need once the work is done — and on a finished movement it read as
 * though nothing had been logged. Uniform sets collapse the way they do
 * everywhere else in this app ("4×8 @ 135"); anything else is listed, because
 * three at 135 and one at 155 is not four of anything.
 *
 * Null when there is nothing logged, so the caller can fall back to the target
 * — which is the right thing to show on a movement she has not started.
 */
export function loggedSummary(
  sets: readonly { reps: number; weight: number | null; holdSeconds?: number | null }[],
  unit: string,
  isHold: boolean,
): string | null {
  if (sets.length === 0) return null;

  const count = (s: { reps: number; holdSeconds?: number | null }) =>
    isHold ? formatCount(s.holdSeconds ?? s.reps, true) : String(s.reps);

  const sameCount = sets.every((s) => count(s) === count(sets[0]));
  const sameWeight = sets.every((s) => s.weight === sets[0].weight);
  if (sameCount && sameWeight) {
    const load = sets[0].weight === null ? "" : ` @ ${sets[0].weight}${unit}`;
    return `${sets.length}×${count(sets[0])}${load}`;
  }
  return sets.map((s) => describeSet(s, isHold)).join(" · ");
}
