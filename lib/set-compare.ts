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
 * Where both carry a load the comparison is **total volume, with the load
 * breaking a tie** — see `compareSet` for the two reported cases that fix
 * that rule in place, and tests/set-compare.test.ts, which holds every case
 * he has ever reported by name.
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
 * inside it is arithmetic rather than progress.
 */
const LEVEL = 0.02;

/** Total work in the set: load × reps, or reps alone with nothing in hand. */
export const volume = (s: ComparableSet): number =>
  s.weight !== null ? s.weight * s.reps : s.reps;

/**
 * Volume decides; where volume is level, the heavier load wins.
 *
 * This rule has been changed three times and this is the one that survives,
 * because it is the only one that gives his answers to both of the cases he
 * reported, and it is written down here with both of them so it cannot be
 * changed a fourth time by accident (see tests/set-compare.test.ts, which
 * holds every reported case by name):
 *
 * - **11@40 against 6@50 is up.** "It also said 11@40 is worse than 6@50
 *   which is false from a total volume standpoint." 440 against 300 — she
 *   moved half as much again. Estimated one-rep max says the opposite
 *   (54.7 against 60), which is why e1RM cannot be the rule on its own: it
 *   rewards the bar and ignores the work.
 * - **8@50 against 9@45 is up.** "9@45 is green, 8@50 is more slightly, so
 *   that's the one that should be green." 400 against 405 is inside the
 *   band — the same work, to a plate's rounding — and five pounds more on
 *   the bar for it is the better set. Volume alone would have called it
 *   down, which is why volume cannot be the rule on its own either.
 *
 * So: volume first, and the load only breaks a tie. A set that is level on
 * both is level.
 */
export function compareSet(now: ComparableSet | undefined | null, prev: ComparableSet | undefined | null): SetComparison {
  if (!now || !prev) return null;
  // One loaded and one not: the same number means two different things.
  if ((now.weight === null) !== (prev.weight === null)) return null;
  const a = volume(now);
  const b = volume(prev);
  if (b <= 0) return null;
  const delta = (a - b) / b;
  if (Math.abs(delta) > LEVEL) return delta > 0 ? "up" : "down";
  // Level on work. The heavier set is the harder one, when there is one.
  if (now.weight !== null && prev.weight !== null && now.weight !== prev.weight) {
    return now.weight > prev.weight ? "up" : "down";
  }
  return "same";
}
