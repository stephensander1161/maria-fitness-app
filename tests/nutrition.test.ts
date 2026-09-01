import { describe as suite, expect, it } from "vitest";
import { CALORIE_FLOOR, FIBRE_TARGET_G, fibreForDay, nutritionTargets } from "@/lib/nutrition";

const base = {
  weightKg: 78,
  heightIn: 66,
  age: 32,
  sex: "female" as const,
  daysPerWeek: 3,
  units: "imperial" as const,
};

suite("starting nutrition targets", () => {
  it("puts a real person in a plausible range", () => {
    const { calorieTarget, proteinTargetG } = nutritionTargets(base);
    // 32f, 5'6", 172lb, training 3 days: maintenance lands near 2000.
    expect(calorieTarget).toBeGreaterThan(1300);
    expect(calorieTarget).toBeLessThan(1800);
    expect(proteinTargetG).toBeGreaterThan(100);
    expect(proteinTargetG).toBeLessThan(150);
  });

  it("never goes below the floor, however small the person", () => {
    // The case that matters: a light, older, sedentary person is exactly who a
    // naive formula starves.
    for (const weightKg of [40, 45, 50]) {
      for (const age of [30, 55, 70]) {
        const { calorieTarget } = nutritionTargets({
          ...base, weightKg, age, heightIn: 60, daysPerWeek: 2,
        });
        expect(calorieTarget, `${weightKg}kg age ${age}`).toBeGreaterThanOrEqual(CALORIE_FLOOR);
      }
    }
  });

  it("scales with body size rather than being fixed", () => {
    const small = nutritionTargets({ ...base, weightKg: 55 });
    const large = nutritionTargets({ ...base, weightKg: 110 });
    expect(large.calorieTarget).toBeGreaterThan(small.calorieTarget);
    expect(large.proteinTargetG).toBeGreaterThan(small.proteinTargetG);
  });

  it("caps the deficit so a large person is not starved proportionally", () => {
    // Deficit is bounded at 750, so past ~97kg it stops growing.
    const a = nutritionTargets({ ...base, weightKg: 100 });
    const b = nutritionTargets({ ...base, weightKg: 130 });
    const maintenanceGap = (b.calorieTarget - a.calorieTarget);
    expect(maintenanceGap).toBeGreaterThan(0);
  });

  it("gives more to someone training more days", () => {
    const three = nutritionTargets({ ...base, daysPerWeek: 3 });
    const five = nutritionTargets({ ...base, daysPerWeek: 5 });
    expect(five.calorieTarget).toBeGreaterThan(three.calorieTarget);
  });

  it("uses the male constant only for male", () => {
    const female = nutritionTargets({ ...base, sex: "female" });
    const male = nutritionTargets({ ...base, sex: "male" });
    const other = nutritionTargets({ ...base, sex: "other" });
    expect(male.calorieTarget).toBeGreaterThan(female.calorieTarget);
    // "other" errs toward the smaller deficit rather than guessing upward.
    expect(other.calorieTarget).toBe(female.calorieTarget);
  });

  it("targets protein at roughly 1.6g per kg", () => {
    for (const weightKg of [50, 70, 90, 110]) {
      const { proteinTargetG } = nutritionTargets({ ...base, weightKg });
      expect(proteinTargetG).toBeGreaterThanOrEqual(weightKg * 1.6 - 3);
      expect(proteinTargetG).toBeLessThanOrEqual(weightKg * 1.6 + 3);
    }
  });

  it("reads height in centimetres when she uses metric", () => {
    const imperial = nutritionTargets({ ...base, heightIn: 66, units: "imperial" });
    const metric = nutritionTargets({ ...base, heightIn: 167.64, units: "metric" });
    // 66in is 167.64cm — the same person, so the same answer.
    expect(metric.calorieTarget).toBe(imperial.calorieTarget);
  });

  it("returns whole, roundable numbers rather than raw arithmetic", () => {
    const { calorieTarget, proteinTargetG } = nutritionTargets(base);
    expect(calorieTarget % 10).toBe(0);
    expect(proteinTargetG % 5).toBe(0);
  });
});

suite("a day's fibre", () => {
  // The whole point of this function. Fibre is known only for food looked up
  // against the library; a meal typed in words carries no figure. Summing what
  // we have and calling it her day's fibre under-reports every day she typed a
  // sentence, and reads as failure at something she may have done fine.
  it("reports how much of the day it actually covers", () => {
    const r = fibreForDay([{ fibreG: 6 }, { fibreG: null }, { fibreG: 4 }]);
    expect(r.grams).toBe(10);
    expect(r.knownFor).toBe(2);
    expect(r.unknownFor).toBe(1);
    expect(r.complete).toBe(false);
  });

  it("is complete only when every log carries a figure", () => {
    expect(fibreForDay([{ fibreG: 6 }, { fibreG: 4 }]).complete).toBe(true);
    expect(fibreForDay([{ fibreG: 6 }, { fibreG: null }]).complete).toBe(false);
  });

  // A zero is a real measurement — oil genuinely has no fibre — and must not
  // be confused with the absence of one.
  it("counts a genuine zero as known", () => {
    const r = fibreForDay([{ fibreG: 0 }, { fibreG: 5 }]);
    expect(r.grams).toBe(5);
    expect(r.knownFor).toBe(2);
    expect(r.complete).toBe(true);
  });

  it("is not complete when nothing is logged at all", () => {
    const r = fibreForDay([]);
    expect(r.grams).toBe(0);
    expect(r.complete).toBe(false);
  });

  it("targets the adult guideline", () => {
    expect(FIBRE_TARGET_G).toBe(30);
  });
});
