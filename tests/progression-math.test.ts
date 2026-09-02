import { describe as suite, expect, it } from "vitest";
import {
  estimate1RM, loadStepKg, nextPrescription, sessionBest, toStep, warmupRamp,
} from "@/lib/progression-math";

const set = (reps: number, weightKg: number | null = 40, rir: number | null = 2) =>
  ({ reps, weightKg, rir });
const session = (date: string, sets: ReturnType<typeof set>[]) => ({ date, sets });

suite("what the kit can actually add", () => {
  it("knows a dumbbell pair goes up in whole dumbbells", () => {
    expect(loadStepKg(["dumbbells"])).toBe(2);
    expect(loadStepKg(["barbell", "rack"])).toBe(2.5);
    expect(loadStepKg(["machine"])).toBe(5);
  });

  it("steps in her units, because the rack is stocked in one or the other", () => {
    // A 2kg jump on a rack stocked in pounds produced "44.1lb", a weight that
    // exists in no gym anywhere.
    const step = loadStepKg(["dumbbells"], "imperial");
    expect(step / 0.45359237).toBeCloseTo(5, 4);
    // And the arithmetic lands on a whole number of pounds — the rounding the
    // display does is to one decimal, so anything inside that reads as 45.
    const next = toStep(40 * 0.45359237 + step, step);
    expect(Math.round((next / 0.45359237) * 10) / 10).toBe(45);
  });

  it("gives bands no step, because there isn't one", () => {
    expect(loadStepKg(["resistance bands"])).toBe(0);
  });

  it("rounds to something loadable", () => {
    expect(toStep(41.3, 2.5)).toBe(42.5);
    expect(toStep(21, 2)).toBe(22);
  });
});

suite("estimating a one-rep max", () => {
  it("folds in what she had left, because that is what the formula is about", () => {
    // 8 reps with 2 left is a 10-rep max effort, not an 8-rep one.
    const withReserve = estimate1RM(set(8, 40, 2))!;
    const toFailure = estimate1RM(set(8, 40, 0))!;
    expect(withReserve.kg).toBeGreaterThan(toFailure.kg);
    expect(toFailure.kg).toBeCloseTo(50.7, 1);
  });

  it("says when it is guessing rather than returning a number that looks the same", () => {
    // Over ~12 effective reps Epley drifts badly, and a set with no RIR
    // recorded is being treated as if she went to failure.
    expect(estimate1RM(set(20, 40, 0))!.reliable).toBe(false);
    expect(estimate1RM(set(8, 40, null))!.reliable).toBe(false);
    expect(estimate1RM(set(8, 40, 2))!.reliable).toBe(true);
  });

  it("returns nothing for a bodyweight set rather than inventing a load", () => {
    expect(estimate1RM(set(10, null, 1))).toBeNull();
  });

  it("takes the best set of a session", () => {
    const best = sessionBest(session("2026-01-01", [set(10, 30, 2), set(5, 45, 1), set(8, 40, 2)]))!;
    expect(best.set.weightKg).toBe(45);
  });
});

suite("deciding what to lift next", () => {
  const target = { sets: 3, reps: 10, weightKg: 40 };
  const opts = { stepKg: 2.5 };

  it("adds load when she hit the top of the range on every set", () => {
    const p = nextPrescription(target, [session("2026-01-08", [set(10), set(10), set(10)])], opts);
    expect(p.change).toBe("up");
    expect(p.weightKg).toBe(42.5);
    // Back to the bottom of the range at the new weight, not straight to 10.
    expect(p.reps).toBe(6);
  });

  it("holds the load and asks for one more rep when she came up short", () => {
    const p = nextPrescription(target, [session("2026-01-08", [set(8), set(8), set(7)])], opts);
    expect(p.change).toBe("hold");
    expect(p.weightKg).toBe(40);
    expect(p.reps).toBe(9);
  });

  it("never drops the weight on a bad week", () => {
    // A beginner in a deficit has bad weeks. Cutting the load is the app
    // telling her she has gone backwards when she has not.
    const p = nextPrescription(target, [
      session("2026-01-08", [set(5), set(4), set(4)]),
      session("2026-01-01", [set(9), set(9), set(8)]),
    ], opts);
    expect(p.weightKg).toBe(40);
    expect(p.change).not.toBe("down");
  });

  it("applies the 2-for-2 rule across two sessions, not one good day", () => {
    const onceOnly = nextPrescription(target, [
      session("2026-01-08", [set(9), set(9), set(12)]),
      session("2026-01-01", [set(8), set(8), set(8)]),
    ], opts);
    expect(onceOnly.change).toBe("hold");

    const twice = nextPrescription(target, [
      session("2026-01-08", [set(9), set(9), set(12)]),
      session("2026-01-01", [set(9), set(9), set(12)]),
    ], opts);
    expect(twice.change).toBe("up");
  });

  it("keeps weights out of the reason, because the reader may be imperial", () => {
    // This module is metric because storage is metric. A sentence built here
    // reached a user logging in pounds as "up 2kg", about her own set.
    const up = nextPrescription(target, [session("2026-01-08", [set(10), set(10), set(10)])], opts);
    expect(up.reason).not.toMatch(/kg|lb/);
    expect(up.fromWeightKg).toBe(40);
    expect(up.stepKg).toBe(2.5);

    const hold = nextPrescription(target, [session("2026-01-08", [set(8), set(8), set(7)])], opts);
    expect(hold.reason).not.toMatch(/kg|lb/);
  });

  it("progresses a bodyweight movement in reps, never in kilos", () => {
    const p = nextPrescription({ sets: 3, reps: 12, weightKg: null }, [
      session("2026-01-08", [set(12, null), set(12, null), set(12, null)]),
    ], { stepKg: 2.5, bodyweight: true });
    expect(p.weightKg).toBeNull();
    expect(p.reps).toBeGreaterThan(12);
    expect(p.reason).toMatch(/harder variation/);
  });

  it("says it is her first time rather than prescribing from nothing", () => {
    const p = nextPrescription(target, [], opts);
    expect(p.change).toBe("first-time");
    expect(p.weightKg).toBe(40);
  });
});

suite("warming up", () => {
  it("ramps to the working weight in loadable jumps", () => {
    const ramp = warmupRamp(60, 2.5);
    expect(ramp.map((r) => r.weightKg)).toEqual([25, 35, 47.5]);
    expect(ramp.every((r) => r.weightKg < 60)).toBe(true);
  });

  it("does not pad a light working set with three warm-ups", () => {
    // Three rungs for a 20kg goblet squat is padding, and padding is why
    // people skip warm-ups altogether.
    expect(warmupRamp(20, 2.5)).toHaveLength(1);
  });

  it("drops rungs that round to the same weight", () => {
    const ramp = warmupRamp(40, 5);
    expect(new Set(ramp.map((r) => r.weightKg)).size).toBe(ramp.length);
  });

  it("has nothing to say about bands or bodyweight", () => {
    expect(warmupRamp(40, 0)).toEqual([]);
    expect(warmupRamp(0, 2.5)).toEqual([]);
  });
});
