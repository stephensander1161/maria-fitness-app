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
 * Where both carry a load the comparison is **estimated one-rep max**, not
 * load × reps. Tonnage says 9@45 (405) beats 8@50 (400), and nobody who has
 * lifted both agrees: five pounds more on the bar for one rep fewer is the
 * better set, and the app calling it a step backwards is the app arguing with
 * her. Epley says 58.5 against 63.3, which is the answer she would give.
 *
 * It also settles the case that started this: 5@50 against 9@45 is 58.3
 * against 58.5 — a third of a per cent apart, which is not a result. Hence
 * the band below.
 */
export type ComparableSet = { reps: number; weight: number | null };

export type SetComparison = "up" | "down" | "same" | null;

/**
 * Epley estimated one-rep max — the fairest single number for comparing
 * 3×10@40 against 4×6@50. Bodyweight sets fall back to total reps.
 *
 * Lives here rather than in `lib/progress.ts` because that module reaches the
 * database and this one is read by the card in the browser. One copy, so the
 * colour on the square and the verdict on the session cannot drift apart.
 */
export function e1rm(weight: number | null, reps: number): number {
  if (weight === null || weight === 0) return reps;
  return weight * (1 + reps / 30);
}

/**
 * Two per cent either way is not a result.
 *
 * The same band `classify` puts on a session, for the same reason: the
 * smallest plate she owns moves a working set by more than this, so anything
 * inside it is arithmetic rather than progress. Without it 5@50 against 9@45
 * — three tenths of a per cent — was reported as a step down.
 */
const LEVEL = 0.02;

export function compareSet(now: ComparableSet | undefined | null, prev: ComparableSet | undefined | null): SetComparison {
  if (!now || !prev) return null;
  // One loaded and one not: the same number means two different things.
  if ((now.weight === null) !== (prev.weight === null)) return null;
  const a = e1rm(now.weight, now.reps);
  const b = e1rm(prev.weight, prev.reps);
  if (b <= 0) return null;
  const delta = (a - b) / b;
  if (Math.abs(delta) <= LEVEL) return "same";
  return delta > 0 ? "up" : "down";
}
