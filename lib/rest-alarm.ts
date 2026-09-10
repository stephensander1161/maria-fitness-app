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

/* ------------------------------------------------- what comes next --- */

export type Movement = { slug: string; targetSets: number; done: number };

/**
 * What happens after she logs a set of `slug`.
 *
 * Three outcomes, and they have to be three because two of them used to be
 * `null` and the caller could not tell them apart:
 *
 * - **same** — that movement still has sets in it. The ordinary between-sets
 *   rest, counting down to the same thing.
 * - **next** — that set finished the movement, and something else is still
 *   owed. Wrapping, because she may have worked down the list and come back.
 *   Resting into the *next* movement rather than back into the finished one is
 *   the difference between a useful countdown and the GO screen offering her a
 *   fifth set of something she has done four of.
 * - **done** — that set finished the movement and nothing else is outstanding.
 *   The planned work is over, and there is nothing to count down to.
 *
 * `advance` collapsed "done" into "same" by returning null for both, so
 * finishing the last set of the last movement started another rest — the app
 * counting her down to a set that does not exist.
 */
export type WhatNext<T> =
  | { kind: "same" }
  | { kind: "next"; movement: T }
  | { kind: "done" };

export function whatNext<T extends Movement>(session: T[], slug: string): WhatNext<T> {
  const at = session.findIndex((m) => m.slug === slug);
  // A movement that is not on the plan at all — an extra she added, or a day
  // that has moved under her. There is no "rest of the session" to reason
  // about, so this behaves like any ordinary set.
  if (at === -1) return { kind: "same" };

  const current = session[at];
  // `done` is the count before this set, so this set is the one that finishes it.
  const finished = current.targetSets > 0 && current.done + 1 >= current.targetSets;
  if (!finished) return { kind: "same" };

  const order = [...session.slice(at + 1), ...session.slice(0, at)];
  const owed = order.find((m) => m.targetSets > 0 && m.done < m.targetSets);
  return owed ? { kind: "next", movement: owed } : { kind: "done" };
}

/**
 * The movement to rest into, or null. Kept because it reads well at the one
 * call site that only cares whether there is a *different* movement next —
 * but anything deciding whether to rest at all wants `whatNext`, which can
 * tell "nothing left" from "more of this one".
 */
export function advance<T extends Movement>(session: T[], slug: string): T | null {
  const next = whatNext(session, slug);
  return next.kind === "next" ? next.movement : null;
}
