/**
 * When a sleep fact is the right fact.
 *
 * The card at the bottom of every screen is read most at the two ends of the
 * day, and the one thing worth saying at half past ten at night is about
 * sleep — the caffeine half-life, what five hours does to fat loss. After
 * LATE_FROM in *her* timezone, most picks are sleep facts; not all, or the
 * card becomes a nag. Pure, so the window and the share are tested; the
 * caller supplies the hour and the roll.
 */
export const LATE_FROM = 22;
/** Still night until this hour — someone up at two is still someone up late. */
export const LATE_UNTIL = 4;
/** Share of late-night picks that are about sleep. */
export const SLEEP_SHARE = 0.7;

export type FactTopic = "sleep";

export const isLate = (hour: number): boolean => hour >= LATE_FROM || hour < LATE_UNTIL;

/** The topic to prefer for this pick, if any. `roll` is uniform in [0, 1). */
export function preferredTopic(hour: number, roll: number): FactTopic | undefined {
  return isLate(hour) && roll < SLEEP_SHARE ? "sleep" : undefined;
}
