import { describe as suite, expect, it } from "vitest";
import { compareSet, e1rm } from "@/lib/set-compare";

suite("this set against the same set last time", () => {
  it("compares estimated one-rep max, not tonnage", () => {
    /*
      Stephen, looking at a finished movement: "9@45 is green, 8@50 is more
      slightly, so thats the one that should be green".

      He is right and tonnage is what got it wrong: 9×45 is 405 and 8×50 is
      400, so load × reps called five pounds more on the bar a step backwards.
      Epley says 58.5 against 63.3, which is the answer anybody who has lifted
      both would give.
    */
    expect(compareSet({ reps: 8, weight: 50 }, { reps: 9, weight: 45 })).toBe("up");
    expect(compareSet({ reps: 9, weight: 45 }, { reps: 8, weight: 50 })).toBe("down");
    // The plain cases still read the plain way round.
    expect(compareSet({ reps: 8, weight: 30 }, { reps: 10, weight: 20 })).toBe("up");
    expect(compareSet({ reps: 10, weight: 20 }, { reps: 8, weight: 30 })).toBe("down");
    expect(compareSet({ reps: 10, weight: 20 }, { reps: 10, weight: 20 })).toBe("same");
  });

  it("calls a third of a per cent a draw", () => {
    /*
      The case that started it: "it also said 9@45 is more than 5@50 wich is
      false". 58.5 against 58.3 — the two sets are the same set as far as
      anything that matters, and the two per cent band says so rather than
      picking a winner by a rounding error. Same band `classify` puts on a
      session, and for the same reason: the smallest plate she owns moves a
      working set by more than this.
    */
    expect(compareSet({ reps: 9, weight: 45 }, { reps: 5, weight: 50 })).toBe("same");
    expect(compareSet({ reps: 5, weight: 50 }, { reps: 9, weight: 45 })).toBe("same");
    // Just outside it is a result again.
    expect(compareSet({ reps: 10, weight: 50 }, { reps: 8, weight: 50 })).toBe("up");
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
