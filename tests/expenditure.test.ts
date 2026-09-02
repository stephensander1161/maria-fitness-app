import { describe as suite, expect, it } from "vitest";
import { estimateExpenditure, proposeTarget, slopeKgPerDay, KCAL_PER_KG } from "@/lib/expenditure";

/**
 * The estimate is arithmetic anyone can check. The rails are the reason this
 * file is long: every one of them exists so the app cannot quietly do
 * something to her that looks like a number going down.
 */
const iso = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const days = (n: number, calories: number | null, complete = calories !== null) =>
  Array.from({ length: n }, (_, i) => ({ date: iso(i), calories, caloriesComplete: complete }));
const weighing = (n: number, from: number, perDay: number) =>
  Array.from({ length: n }, (_, i) => ({ date: iso(i), weightKg: from + i * perDay }));

suite("measuring what she burns", () => {
  it("reads maintenance off a flat trend", () => {
    // Eating 2000 and holding weight means burning 2000. No formula involved.
    const e = estimateExpenditure(days(14, 2000), weighing(14, 70, 0), iso(13));
    expect(e.confidence).toBe("high");
    expect(e.tdee).toBeGreaterThan(1950);
    expect(e.tdee).toBeLessThan(2050);
  });

  it("adds the deficit back when she is losing", () => {
    // 1500 a day, half a kilo a fortnight: 1500 + (0.5 × 7700 / 14) ≈ 1775.
    const e = estimateExpenditure(days(14, 1500), weighing(14, 70, -0.5 / 13), iso(13));
    expect(e.tdee).toBeGreaterThan(1700);
    expect(e.tdee).toBeLessThan(1850);
    expect(e.weightChangeKg).toBeLessThan(0);
  });

  it("smooths toward the measurement instead of jumping to it", () => {
    const previous = 2400;
    const e = estimateExpenditure(days(14, 2000), weighing(14, 70, 0), iso(13), previous);
    // Somewhere between the old estimate and the new measurement.
    expect(e.tdee!).toBeLessThan(previous);
    expect(e.tdee!).toBeGreaterThan(2000);
  });
});

suite("what it refuses to do", () => {
  it("will not estimate from a mostly uncounted fortnight", () => {
    // The one that matters: an estimate built on four counted days would lower
    // her target because she was busy, not because she ate less.
    const window = [...days(4, 1500), ...days(10, null, false).map((d, i) => ({ ...d, date: iso(4 + i) }))];
    const e = estimateExpenditure(window, weighing(14, 70, 0), iso(13));
    expect(e.tdee).toBeNull();
    expect(e.why).toMatch(/not enough to measure/i);
  });

  it("will not estimate from food logged without figures", () => {
    const window = days(14, 0, false);
    const e = estimateExpenditure(window, weighing(14, 70, 0), iso(13));
    expect(e.tdee).toBeNull();
    expect(e.confidence).not.toBe("high");
  });

  it("will not estimate without enough weigh-ins", () => {
    const sparse = [{ date: iso(0), weightKg: 70 }, { date: iso(13), weightKg: 69.5 }];
    const e = estimateExpenditure(days(14, 1500), sparse, iso(13));
    expect(e.tdee).toBeNull();
    expect(e.why).toMatch(/weigh-ins/i);
  });

  it("says the numbers are wrong rather than believing an impossible one", () => {
    // 1200 a day and 3kg lost in a fortnight is 2850 kcal/day burned by a
    // 70kg person: something is mis-logged, and acting on it would cut her
    // target on the strength of a typo.
    const e = estimateExpenditure(days(14, 1200), weighing(14, 70, -6 / 13), iso(13));
    expect(e.tdee).toBeNull();
    expect(e.why).toMatch(/mis-logged|do not add up/i);
  });
});

suite("the rails on the target it proposes", () => {
  const bmr = 1400;

  it("takes the deficit off the measured expenditure", () => {
    const p = proposeTarget(2200, 70, bmr);
    expect(p.calorieTarget).toBeLessThan(2200);
    expect(p.rateKgPerWeek).toBeGreaterThan(0);
    expect(p.limitedBy).toBeNull();
  });

  it("never prescribes below what she burns at rest", () => {
    // Sustained low energy availability costs bone density and her cycle. No
    // rate of loss is worth that, so the number never leaves this function.
    const p = proposeTarget(1600, 55, 1450);
    expect(p.calorieTarget).toBeGreaterThanOrEqual(1450);
    expect(p.limitedBy).toBe("bmr");
    expect(p.note).toMatch(/at rest/);
  });

  it("never goes below the app's own floor either", () => {
    const p = proposeTarget(1300, 45, 1100);
    expect(p.calorieTarget).toBeGreaterThanOrEqual(1200);
  });

  it("caps how fast she can be asked to lose, even if she asks for more", () => {
    const p = proposeTarget(2400, 70, bmr, { rateKgPerWeek: 2 });
    expect(p.limitedBy).toBe("rate");
    // 0.75% of 70kg is about half a kilo.
    expect(p.rateKgPerWeek).toBeLessThanOrEqual(0.55);
  });

  it("keeps the arithmetic honest: deficit times seven over 7700", () => {
    const p = proposeTarget(2000, 60, 1300, { rateKgPerWeek: 0.4 });
    const impliedDeficit = 2000 - p.calorieTarget;
    expect(impliedDeficit * 7 / KCAL_PER_KG).toBeCloseTo(0.4, 1);
  });
});

suite("the weight side uses every reading, not the two on the ends", () => {
  it("reads a steady fall as its actual slope", () => {
    const points = Array.from({ length: 14 }, (_, i) => ({ date: iso(i), weightKg: 70 - i * 0.05 }));
    expect(slopeKgPerDay(points)!).toBeCloseTo(-0.05, 3);
  });

  it("is barely moved by one bloated morning", () => {
    const clean = Array.from({ length: 14 }, (_, i) => ({ date: iso(i), weightKg: 70 - i * 0.05 }));
    const withSpike = clean.map((p, i) => (i === 13 ? { ...p, weightKg: p.weightKg + 1.5 } : p));
    // Endpoint-to-endpoint would swing from −0.65kg to +0.85kg — the whole
    // fortnight's conclusion reversed by a single Tuesday.
    expect(slopeKgPerDay(withSpike)!).toBeGreaterThan(-0.05);
    expect(slopeKgPerDay(withSpike)!).toBeLessThan(0.01);
  });

  it("refuses a slope from two readings", () => {
    expect(slopeKgPerDay([{ date: iso(0), weightKg: 70 }, { date: iso(7), weightKg: 69 }])).toBeNull();
  });

  it("does not under-read a real change the way a moving average does", () => {
    // The bug this replaced: trend endpoints inside a fortnight lag the truth
    // by a third, so a 1775 kcal expenditure measured as 1607 — and the app
    // would have cut her target by 170 kcal for nothing.
    const e = estimateExpenditure(days(14, 1500), weighing(14, 70, -0.5 / 13), iso(13));
    expect(e.tdee!).toBeGreaterThan(1740);
    expect(e.tdee!).toBeLessThan(1810);
  });
});
