/**
 * This set against the same set last time.
 *
 * The card puts last session's sets directly under today's, column for column,
 * so the comparison is a glance rather than arithmetic. This decides the
 * colour, and its whole job is **refusing to answer** when the two are not
 * comparable:
 *
 * - A weighted set and a bodyweight one are different movements of the same
 *   name. 8 reps at 30lb against 8 bodyweight reps is not a draw, and calling
 *   it one is the "unknown is not zero" failure in colour form.
 * - Missing either side is `null`, never "same". A set she has not logged yet
 *   is not a set she matched.
 *
 * Where both carry a load, the comparison is load × reps: eight at 30 beats
 * ten at 20, and reps alone would say the opposite.
 */
export type ComparableSet = { reps: number; weight: number | null };

export type SetComparison = "up" | "down" | "same" | null;

function effort(s: ComparableSet): number {
  return s.weight !== null ? s.weight * s.reps : s.reps;
}

export function compareSet(now: ComparableSet | undefined | null, prev: ComparableSet | undefined | null): SetComparison {
  if (!now || !prev) return null;
  // One loaded and one not: the same number means two different things.
  if ((now.weight === null) !== (prev.weight === null)) return null;
  const a = effort(now);
  const b = effort(prev);
  if (a === b) return "same";
  return a > b ? "up" : "down";
}
