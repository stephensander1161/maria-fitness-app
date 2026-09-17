import { describe as suite, expect, it } from "vitest";
import { compareSet, e1rm, volume } from "@/lib/set-compare";

/*
  Every case he has reported, by name and in his words.

  This rule was changed three times — tonnage, then estimated one-rep max, then
  the one below — and each change fixed the case in front of it and broke one
  behind it. "We've fixed this multiple times so regressions are happening,
  add unit tests for this stuff so no more regressions." So: the cases are
  the spec. A change to `compareSet` that turns any of these must be made on
  purpose, here, with the reason.
*/
suite("the reported cases — the spec for compareSet", () => {
  it("11@40 beats 6@50: more work is the better set", () => {
    // 2026-09-16: "it also said 11@40 is worse than 6@50 which is false from
    // a total volume standpoint." 440 against 300. Estimated one-rep max says
    // the opposite (54.7 against 60), which is why it cannot be the rule.
    expect(compareSet({ reps: 11, weight: 40 }, { reps: 6, weight: 50 })).toBe("up");
    expect(compareSet({ reps: 6, weight: 50 }, { reps: 11, weight: 40 })).toBe("down");
  });

  it("8@50 beats 9@45: level work, and the heavier bar wins the tie", () => {
    // 2026-09-14: "9@45 is green, 8@50 is more slightly, so that's the one
    // that should be green." 400 against 405 is inside the two per cent band
    // — the same work, to a plate's rounding — and five pounds more on the
    // bar for it is the harder set. Volume alone called it down, which is why
    // volume cannot be the rule on its own either.
    expect(compareSet({ reps: 8, weight: 50 }, { reps: 9, weight: 45 })).toBe("up");
    expect(compareSet({ reps: 9, weight: 45 }, { reps: 8, weight: 50 })).toBe("down");
  });

  it("8@40 against 8@50 is down: less work at a lighter load", () => {
    // From the same screenshot as the 11@40 report — the first set, red, and
    // correctly so: 320 against 400.
    expect(compareSet({ reps: 8, weight: 40 }, { reps: 8, weight: 50 })).toBe("down");
  });

  it("9@45 against 5@50 is up: sixty per cent more work is not a draw", () => {
    // Earlier this was forced to "same" under the e1RM rule (58.5 against
    // 58.3). Under the rule that survives, 405 against 250 is a step up, and
    // the words that reported it — "total weight lifted wins" — agree.
    expect(compareSet({ reps: 9, weight: 45 }, { reps: 5, weight: 50 })).toBe("up");
  });
});

suite("this set against the same set last time", () => {
  it("compares total work, and reads the plain cases the plain way round", () => {
    expect(compareSet({ reps: 8, weight: 30 }, { reps: 10, weight: 20 })).toBe("up");
    expect(compareSet({ reps: 10, weight: 20 }, { reps: 8, weight: 30 })).toBe("down");
    expect(compareSet({ reps: 10, weight: 20 }, { reps: 10, weight: 20 })).toBe("same");
    expect(volume({ reps: 11, weight: 40 })).toBe(440);
  });

  it("calls two per cent a draw, and breaks it only on the bar", () => {
    // The same band `classify` puts on a session: the smallest plate she owns
    // moves a working set by more than this. Inside it, the same load is the
    // same set; a heavier load is the harder one.
    expect(compareSet({ reps: 10, weight: 50 }, { reps: 10, weight: 50 })).toBe("same");
    expect(compareSet({ reps: 10, weight: 50 }, { reps: 8, weight: 50 })).toBe("up");
    expect(compareSet({ reps: 13, weight: 50 }, { reps: 12, weight: 54 })).toBe("down");
  });

  it("compares reps when neither is loaded", () => {
    expect(compareSet({ reps: 12, weight: null }, { reps: 10, weight: null })).toBe("up");
    expect(compareSet({ reps: 8, weight: null }, { reps: 10, weight: null })).toBe("down");
  });

  it("refuses when one is loaded and the other is not", () => {
    // Eight at 30lb against eight bodyweight reps is not a draw. Colouring it
    // one is the "unknown is not zero" failure with a green tick on it.
    expect(compareSet({ reps: 8, weight: 30 }, { reps: 8, weight: null })).toBeNull();
    expect(compareSet({ reps: 8, weight: null }, { reps: 8, weight: 30 })).toBeNull();
  });

  it("refuses when either side is missing", () => {
    // A set she has not logged yet is not a set she matched.
    expect(compareSet(undefined, { reps: 8, weight: 30 })).toBeNull();
    expect(compareSet({ reps: 8, weight: 30 }, undefined)).toBeNull();
    expect(compareSet(null, null)).toBeNull();
  });

  it("is one copy of Epley, shared with the session verdict", () => {
    // `lib/progress.ts` reaches the database, so the card cannot import from
    // it — and two copies of this formula would be two answers to the same
    // question, one on the square and one in the sentence underneath.
    expect(e1rm(50, 8)).toBeCloseTo(63.33, 2);
    expect(e1rm(45, 9)).toBeCloseTo(58.5, 2);
    // A bodyweight set has no load to estimate from, so it falls back to reps.
    expect(e1rm(null, 12)).toBe(12);
    expect(e1rm(0, 12)).toBe(12);
  });
});
