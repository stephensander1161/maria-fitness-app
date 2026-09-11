import { describe as suite, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import { advance, isOver, lastFired, markFired, nextRest, resetFired, shouldFire, whatNext } from "@/lib/rest-alarm";

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

suite("what the rest counts down to", () => {
  const m = (slug: string, targetSets: number, done: number) => ({ slug, targetSets, done });

  it("stays on the movement while it has sets left", () => {
    // The ordinary between-sets rest: the GO screen offers the next set of
    // the same thing.
    expect(advance([m("curl", 4, 0), m("row", 3, 0)], "curl")).toBeNull();
    expect(advance([m("curl", 4, 2), m("row", 3, 0)], "curl")).toBeNull();
  });

  it("moves to the next movement on the set that finishes one", () => {
    // `done` is the count before this set, so 3 of 4 means this is the last.
    expect(advance([m("curl", 4, 3), m("row", 3, 0)], "curl")?.slug).toBe("row");
  });

  it("skips movements that are already done, and wraps", () => {
    const session = [m("a", 3, 3), m("b", 3, 2), m("c", 3, 0)];
    expect(advance(session, "b")?.slug).toBe("c");
    // She worked down the list and came back: the one still outstanding is
    // behind her.
    expect(advance([m("a", 3, 0), m("b", 3, 3), m("c", 3, 2)], "c")?.slug).toBe("a");
  });

  it("counts down to nothing when that was the last set of the session", () => {
    expect(advance([m("a", 3, 3), m("b", 3, 2)], "b")).toBeNull();
  });

  it("knows nothing about a movement it was not told about", () => {
    // The GO screen fires on every screen; only Train registers a session.
    expect(advance([], "curl")).toBeNull();
    expect(advance([m("row", 3, 0)], "curl")).toBeNull();
  });

  it("is used by the GO screen's own logging path, not just the card's", () => {
    // The card calls onLogged; the GO screen logs through the provider. Only
    // fixing the card left the GO screen offering a fifth set of a movement
    // she had done four of, which is exactly what was reported.
    const provider = fs.readFileSync("components/rest-provider.tsx", "utf8");
    // `whatNext` now, because `advance` could not say whether "no next
    // movement" meant more sets of this one or the end of the session.
    expect(provider).toMatch(/const after = whatNext\(session\.current, go\.slug\)/);
    expect(provider).toMatch(/slug: after\.movement\.slug, name: after\.movement\.name/);
    // And the Train screen tells it what today holds.
    expect(fs.readFileSync("components/train-client.tsx", "utf8")).toMatch(/setSession\(view\.exercises\.map/);
  });

  it("the highlight follows the rest when one is running", () => {
    // …and falls back to the first movement with sets left, so something is
    // always marked. The marker used to exist only during the rest, which is
    // most of the time nothing at all.
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/stillToDo\(runningRest\?\.slug\)/);
    expect(card).toMatch(/upNext=\{currentSlug === ex\.slug\}/);
  });
});

suite("the session ending is not another rest", () => {
  const m = (slug: string, targetSets: number, done: number) => ({ slug, targetSets, done });

  it("tells 'more of this one' apart from 'nothing left'", () => {
    // Both used to be null, and the GO screen rested on either — so finishing
    // the last set of the last movement counted her down to a set that does
    // not exist.
    expect(whatNext([m("curl", 3, 1), m("row", 3, 3)], "curl")).toEqual({ kind: "same" });
    expect(whatNext([m("curl", 3, 2), m("row", 3, 3)], "curl")).toEqual({ kind: "done" });
  });

  it("rests into the next movement when one is owed", () => {
    const next = whatNext([m("curl", 3, 2), m("row", 3, 0)], "curl");
    expect(next).toEqual({ kind: "next", movement: m("row", 3, 0) });
  });

  it("wraps, because she may have worked down the list and come back", () => {
    expect(whatNext([m("a", 3, 0), m("b", 3, 2)], "b")).toEqual({ kind: "next", movement: m("a", 3, 0) });
  });

  it("is 'done' only when the set in hand finishes the movement", () => {
    // One short of the target is still the ordinary between-sets rest, even
    // when every other movement is complete.
    expect(whatNext([m("a", 3, 3), m("b", 3, 1)], "b")).toEqual({ kind: "same" });
    expect(whatNext([m("a", 3, 3), m("b", 3, 2)], "b")).toEqual({ kind: "done" });
  });

  it("treats a movement that is not on the plan as an ordinary set", () => {
    // An extra she added, or a day that moved under her. There is no rest of
    // the session to reason about.
    expect(whatNext([m("a", 3, 0)], "curl")).toEqual({ kind: "same" });
    expect(whatNext([], "curl")).toEqual({ kind: "same" });
  });

  it("ignores movements with no target when deciding what is owed", () => {
    // targetSets 0 is "she added it, there is no plan for it" — it cannot keep
    // the session open forever.
    expect(whatNext([m("a", 3, 2), m("extra", 0, 1)], "a")).toEqual({ kind: "done" });
  });

  it("is what the GO screen actually asks", () => {
    const provider = fs.readFileSync("components/rest-provider.tsx", "utf8");
    expect(provider).toMatch(/whatNext\(session\.current, go\.slug\)/);
    // And "done" writes no rest at all.
    expect(provider).toMatch(/after\.kind === "done" \? null : nextRest\(/);
  });
});

suite("a superset is one round, then one rest", () => {
  const s = (slug: string, targetSets: number, done: number, supersetGroup: string | null = null) =>
    ({ slug, targetSets, done, supersetGroup });

  it("goes straight on to the partner, with no rest between", () => {
    // That is what a superset *is*. A ninety-second countdown in the middle of
    // one is the app misunderstanding the movement.
    const pair = [s("press", 3, 0, "g1"), s("row", 3, 0, "g1")];
    expect(whatNext(pair, "press")).toEqual({ kind: "straight-on", movement: s("row", 3, 0, "g1") });
  });

  it("rests only once the round is complete", () => {
    // One set of each. After the second half, the pair has earned its rest.
    const pair = [s("press", 3, 1, "g1"), s("row", 3, 0, "g1")];
    expect(whatNext(pair, "row")).toEqual({ kind: "same" });
  });

  it("alternates through a chain of three rather than bouncing between two", () => {
    const three = [s("a", 3, 0, "g"), s("b", 3, 0, "g"), s("c", 3, 0, "g")];
    expect(whatNext(three, "a")).toEqual({ kind: "straight-on", movement: s("b", 3, 0, "g") });
    expect(whatNext([s("a", 3, 1, "g"), s("b", 3, 1, "g"), s("c", 3, 0, "g")], "b"))
      .toEqual({ kind: "straight-on", movement: s("c", 3, 0, "g") });
  });

  it("skips a partner that is already finished", () => {
    const pair = [s("press", 4, 2, "g1"), s("row", 2, 2, "g1")];
    expect(whatNext(pair, "press")).toEqual({ kind: "same" });
  });

  it("never pairs movements that merely sit next to each other", () => {
    const loose = [s("press", 3, 0), s("row", 3, 0)];
    expect(whatNext(loose, "press")).toEqual({ kind: "same" });
    // Nor two different chains.
    expect(whatNext([s("a", 3, 0, "g1"), s("b", 3, 0, "g2")], "a")).toEqual({ kind: "same" });
  });

  it("ends the session when the last round finishes", () => {
    // The second half of the last round is the end of the day, not another
    // rest. Press is already done; row's set in hand completes it.
    const pair = [s("press", 2, 2, "g1"), s("row", 2, 1, "g1")];
    expect(whatNext(pair, "row")).toEqual({ kind: "done" });
  });

  it("still owes the partner a set when it is one behind", () => {
    // Both on one of two: finishing row leaves press a set short, so the round
    // is not over and the pair has not earned its rest.
    const pair = [s("press", 2, 1, "g1"), s("row", 2, 1, "g1")];
    expect(whatNext(pair, "row")).toEqual({ kind: "straight-on", movement: s("press", 2, 1, "g1") });
  });

  it("is what both logging paths ask", () => {
    const provider = fs.readFileSync("components/rest-provider.tsx", "utf8");
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    // The GO screen prompts the partner immediately rather than resting.
    expect(provider).toMatch(/after\.kind === "straight-on"/);
    expect(provider).toMatch(/endsAt: Date\.now\(\)/);
    // And the card starts no countdown at all.
    expect(card).toMatch(/next\.kind === "straight-on"/);
    // The group has to reach the provider, or it cannot tell a superset from
    // two movements that happen to be adjacent.
    expect(card).toMatch(/supersetGroup: e\.supersetGroup/);
    expect(provider).toMatch(/supersetGroup: string \| null/);
  });
});
