import { describe as suite, expect, it } from "vitest";
import { classify, describe as describeSets, e1rm, summarise } from "@/lib/progress";
import type { SetSummary } from "@/lib/progress";

/**
 * The progression classifier decides what she is told about a movement, so its
 * boundaries matter more than its happy path. These pin the thresholds so a
 * later tweak to the scoring has to be deliberate.
 */
const sets = (spec: [reps: number, kg: number | null][]): SetSummary[] =>
  spec.map(([reps, weightKg], i) => ({ setNumber: i + 1, reps, weightKg, rpe: null }));

const uniform = (count: number, reps: number, kg: number | null) =>
  sets(Array.from({ length: count }, () => [reps, kg] as [number, number | null]));

const perf = (s: SetSummary[], date = "2026-01-01") => summarise(date, s);

suite("progression thresholds", () => {
  it("a normal rep-scheme change is not a failure", () => {
    // 3x10 at 40 -> 3x8 at 42 drops volume ~16%, which is what moving up a
    // weight looks like. Calling that "missed" would be lying the other way.
    expect(classify(perf(uniform(3, 10, 40)), perf(uniform(3, 8, 42))).status).toBe("matched");
  });

  it("abandoning most of the work is a shortfall even at the same weight", () => {
    expect(classify(perf(uniform(5, 10, 60)), perf(uniform(1, 10, 60))).status).toBe("missed");
  });

  it("a collapse in load is a shortfall even when reps rise", () => {
    expect(classify(perf(sets([[5, 100]])), perf(uniform(10, 3, 20))).status).toBe("missed");
  });

  it("a heavier top set with slightly less volume still counts as progress", () => {
    expect(classify(perf(uniform(3, 10, 50)), perf(uniform(3, 8, 60))).status).toBe("beat");
  });

  it("volume up but top set down is held level, not celebrated", () => {
    // An extra light set does not make it a better session, and "up from last
    // time" would be the wrong thing to tell her.
    const before = perf(uniform(3, 8, 65));
    const after = perf(sets([[8, 60], [8, 60], [8, 60], [10, 20]]));
    expect(classify(before, after).status).toBe("matched");
  });

  suite("bodyweight is judged on reps alone", () => {
    it("same total reps in a different shape holds level", () => {
      expect(classify(perf(sets([[50, null]])), perf(uniform(2, 25, null))).status).toBe("matched");
    });
    it("fewer reps is a shortfall", () => {
      expect(classify(perf(uniform(3, 10, null)), perf(uniform(3, 8, null))).status).toBe("missed");
    });
    it("more reps is progress", () => {
      expect(classify(perf(uniform(3, 10, null)), perf(uniform(3, 12, null))).status).toBe("beat");
    });
  });

  it("first recorded work beats having done none", () => {
    expect(classify(perf([]), perf(uniform(3, 10, 40))).status).toBe("beat");
  });

  it("stopping entirely is a shortfall", () => {
    expect(classify(perf(uniform(3, 10, 40)), perf([])).status).toBe("missed");
  });
});

suite("estimated one-rep max", () => {
  it("rises with load and with reps", () => {
    expect(e1rm(100, 5)).toBeGreaterThan(e1rm(90, 5));
    expect(e1rm(100, 8)).toBeGreaterThan(e1rm(100, 5));
  });

  it("falls back to rep count when there is no load", () => {
    expect(e1rm(null, 12)).toBe(12);
    expect(e1rm(0, 12)).toBe(12);
  });
});

suite("what she reads", () => {
  it("collapses a uniform session and respects her units", () => {
    expect(describeSets(uniform(3, 8, 29.4835), "imperial")).toBe("3×8 @ 65lb");
    expect(describeSets(uniform(3, 8, 40), "metric")).toBe("3×8 @ 40kg");
  });

  it("lists sets out when they differ", () => {
    expect(describeSets(sets([[10, 40], [8, 40]]), "metric")).toBe("10@40, 8@40");
  });
});
