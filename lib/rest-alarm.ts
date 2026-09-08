/**
 * When the rest is over, and what the next one is.
 *
 * Pulled out of the timer component because it produced two bugs in one
 * session that a component test could not have caught and a unit test can:
 * a GO screen that fired twice, and a rest that ran out with no GO at all.
 *
 * Both come from the same place — the moment of "is it over" was decided in
 * three different components from three different clocks, and the guard
 * against firing twice lived in a ref that a remount resets.
 */

export type RestLike = { endsAt: number; seconds: number };

/** A rest whose clock cannot be read is not a rest that is over. */
export function isOver(rest: RestLike | null, now: number): boolean {
  if (!rest || !Number.isFinite(rest.endsAt)) return false;
  return rest.endsAt <= now;
}

/**
 * Should the alarm fire for this rest?
 *
 * `lastFired` is the `endsAt` the alarm last went off for, held outside React
 * so that a remount — a route change, a router.refresh() after logging a set
 * — cannot make it go off a second time for the same rest. That is exactly
 * what produced a second GO screen straight after logging one from the first.
 */
export function shouldFire(rest: RestLike | null, now: number, lastFired: number | null): boolean {
  return isOver(rest, now) && rest!.endsAt !== lastFired;
}

/**
 * The rest that follows the set she just logged.
 *
 * Returns null rather than a broken timer when the stored length is not a
 * positive number of seconds. A rest written with `undefined` seconds gives
 * `endsAt = NaN`, and `NaN <= 0` is false — so it never comes due, the
 * countdown shows nothing, and the alarm never fires. A rest that cannot be
 * timed must be no rest at all, which at least lets her carry on.
 */
export function nextRest<T extends RestLike>(rest: T, now: number): T | null {
  if (!Number.isFinite(rest.seconds) || rest.seconds <= 0) return null;
  return { ...rest, endsAt: now + rest.seconds * 1000 };
}

/* ------------------------------------------------ the guard, outside React --- */

let fired: number | null = null;

/** The `endsAt` the alarm last went off for. */
export const lastFired = (): number | null => fired;
export const markFired = (endsAt: number): void => { fired = endsAt; };
/** For tests, and for a fresh session. */
export const resetFired = (): void => { fired = null; };
