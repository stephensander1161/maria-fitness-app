import { describe as suite, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import { isOver, lastFired, markFired, nextRest, resetFired, shouldFire } from "@/lib/rest-alarm";

/**
 * Two bugs in one session, from the same place: the GO screen fired twice
 * after logging a set from it, and a rest ran out with no GO at all.
 */
const rest = (over: Partial<{ endsAt: number; seconds: number }> = {}) =>
  ({ endsAt: 1_000_000, seconds: 90, ...over });

beforeEach(resetFired);

suite("when the rest is over", () => {
  it("is over at zero and not before", () => {
    expect(isOver(rest(), 999_999)).toBe(false);
    expect(isOver(rest(), 1_000_000)).toBe(true);
    expect(isOver(rest(), 1_000_001)).toBe(true);
  });

  it("a rest whose clock cannot be read is never over", () => {
    // `endsAt: NaN` compares false against everything, so the countdown sat
    // there for ever and the alarm never came due — "time ran out but no GO".
    expect(isOver(rest({ endsAt: NaN }), Date.now())).toBe(false);
    expect(isOver(rest({ endsAt: Infinity }), Date.now())).toBe(false);
    expect(isOver(null, Date.now())).toBe(false);
  });
});

suite("the alarm goes off once per rest", () => {
  it("fires when due, and not twice for the same rest", () => {
    const r = rest();
    expect(shouldFire(r, 1_000_001, lastFired())).toBe(true);
    markFired(r.endsAt);
    // A remount used to reset this — a router.refresh() after logging a set
    // from the GO screen was enough to raise a second GO for a rest that had
    // already gone off.
    expect(shouldFire(r, 1_000_002, lastFired())).toBe(false);
    expect(shouldFire(r, 9_999_999, lastFired())).toBe(false);
  });

  it("fires again for the next rest", () => {
    markFired(1_000_000);
    expect(shouldFire(rest({ endsAt: 1_200_000 }), 1_200_001, lastFired())).toBe(true);
  });

  it("does not fire early just because an older rest went off", () => {
    markFired(1_000_000);
    expect(shouldFire(rest({ endsAt: 1_200_000 }), 1_100_000, lastFired())).toBe(false);
  });
});

suite("the rest that follows the set she just logged", () => {
  it("starts now and runs for the same length", () => {
    expect(nextRest(rest(), 5_000)).toMatchObject({ endsAt: 5_000 + 90_000, seconds: 90 });
  });

  it("keeps everything else about it", () => {
    const next = nextRest({ ...rest(), slug: "bicep-curl", reps: 12, weight: 20 }, 0);
    expect(next).toMatchObject({ slug: "bicep-curl", reps: 12, weight: 20 });
  });

  it("refuses to build one it cannot time", () => {
    // undefined seconds gives endsAt NaN, which never comes due — a timer
    // that is stuck for the rest of the session.
    expect(nextRest(rest({ seconds: undefined as unknown as number }), 0)).toBeNull();
    expect(nextRest(rest({ seconds: NaN }), 0)).toBeNull();
    expect(nextRest(rest({ seconds: 0 }), 0)).toBeNull();
    expect(nextRest(rest({ seconds: -5 }), 0)).toBeNull();
  });
});

suite("both firing paths use the shared guard", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("the countdown bar and the provider's backstop, so neither doubles the other", () => {
    // The bar fires the beep; the provider fires even when the bar is not
    // rendering or its interval has been throttled to a stop by a
    // backgrounded phone. One guard between them.
    expect(read("components/rest-timer.tsx")).toMatch(/shouldFire\(rest, Date\.now\(\), lastFired\(\)\)/);
    expect(read("components/rest-provider.tsx")).toMatch(/shouldFire\(rest, Date\.now\(\), lastFired\(\)\)/);
    expect(read("components/rest-timer.tsx")).not.toMatch(/firedFor/);
  });

  it("never raises an empty GO screen", () => {
    // getSnapshot() is null the moment the rest is dismissed; racing that
    // produced a black screen with nothing on it.
    expect(read("components/rest-provider.tsx")).toMatch(/setGo\(\(g\) => g \?\? getSnapshot\(\)\)/);
  });
});
