import { describe as suite, expect, it } from "vitest";
import { compareSet } from "@/lib/set-compare";

suite("this set against the same set last time", () => {
  it("compares load times reps, not reps", () => {
    // Eight at 30 is more work than ten at 20, and reps alone says the opposite.
    expect(compareSet({ reps: 8, weight: 30 }, { reps: 10, weight: 20 })).toBe("up");
    expect(compareSet({ reps: 10, weight: 20 }, { reps: 8, weight: 30 })).toBe("down");
    expect(compareSet({ reps: 10, weight: 20 }, { reps: 10, weight: 20 })).toBe("same");
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
});
