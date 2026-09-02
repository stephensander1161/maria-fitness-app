import { describe as suite, expect, it } from "vitest";
import { cyclePhase, nextExpected, weightCaveat } from "@/lib/cycle";

const p = (start: string, end: string | null = null) => ({ start, end });

suite("where she is in her cycle", () => {
  const history = [p("2026-01-01", "2026-01-05"), p("2026-01-29", "2026-02-02"), p("2026-02-26", "2026-03-02")];

  it("counts the day of the cycle from the last period", () => {
    expect(cyclePhase(history, "2026-03-05").dayOfCycle).toBe(8);
  });

  it("takes the median of her own cycles, not a textbook 28", () => {
    expect(cyclePhase(history, "2026-03-05").typicalLength).toBe(28);
  });

  it("wants two cycles before it estimates a length at all", () => {
    expect(cyclePhase([p("2026-01-01")], "2026-01-10").typicalLength).toBeNull();
  });

  it("ignores an outlier cycle instead of being dragged by it", () => {
    const withOutlier = [...history, p("2026-05-30")]; // a 93-day gap
    expect(cyclePhase(withOutlier, "2026-06-02").typicalLength).toBe(28);
  });

  it("knows when a period is running and when it is over", () => {
    expect(cyclePhase(history, "2026-02-27").bleeding).toBe(true);
    expect(cyclePhase(history, "2026-03-10").bleeding).toBe(false);
  });

  it("spots the week before one is due", () => {
    // Day 24 of a 28-day cycle.
    expect(cyclePhase(history, "2026-03-21").premenstrual).toBe(true);
    expect(cyclePhase(history, "2026-03-08").premenstrual).toBe(false);
  });

  it("says when the next one is likely", () => {
    expect(nextExpected(history, "2026-03-05")).toBe("2026-03-26");
  });
});

suite("what it lets the coach say about the scale", () => {
  const history = [p("2026-01-01", "2026-01-05"), p("2026-01-29", "2026-02-02"), p("2026-02-26", "2026-03-02")];

  it("explains a rise in the week before, before she reads it as a gain", () => {
    const caveat = weightCaveat(cyclePhase(history, "2026-03-21"), 0.9);
    expect(caveat).toMatch(/water, not fat/);
  });

  it("says nothing at all mid-cycle", () => {
    expect(weightCaveat(cyclePhase(history, "2026-03-08"), 0.9)).toBeNull();
  });

  it("says nothing when the weight is down", () => {
    // A drop needs no excuse, and offering one implies the number is the point.
    expect(weightCaveat(cyclePhase(history, "2026-03-21"), -0.4)).toBeNull();
  });

  it("says nothing when she has logged no cycle at all", () => {
    expect(weightCaveat(cyclePhase([], "2026-03-21"), 1.2)).toBeNull();
  });
});
