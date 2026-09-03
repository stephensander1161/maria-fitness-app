import { describe as suite, expect, it } from "vitest";
import {
  describeComposition, energyFloorKcal, estimateBodyComposition,
} from "@/lib/body-composition";

const her = { waistCm: 80, hipCm: 100, neckCm: 32, heightCm: 168, weightKg: 70 };

suite("estimating body composition from a tape", () => {
  it("produces a plausible figure for a plausible person", () => {
    const c = estimateBodyComposition(her)!;
    expect(c.bodyFatPercent).toBeGreaterThan(20);
    expect(c.bodyFatPercent).toBeLessThan(40);
    expect(c.fatFreeMassKg + c.fatMassKg).toBeCloseTo(70, 0);
  });

  it("always carries its uncertainty", () => {
    // ±4 points against hydrostatic weighing. A number this soft presented
    // without that is a number someone will watch daily.
    expect(estimateBodyComposition(her)!.uncertaintyPoints).toBe(4);
    expect(describeComposition(estimateBodyComposition(her)!, 70)).toMatch(/give or take 4 points/);
    expect(describeComposition(estimateBodyComposition(her)!, 70)).toMatch(/change over months/);
  });

  it("moves the right way when the waist comes down", () => {
    // The use worth having: the level is noise, the change is signal.
    const before = estimateBodyComposition(her)!;
    const after = estimateBodyComposition({ ...her, waistCm: 76, weightKg: 68 })!;
    expect(after.bodyFatPercent).toBeLessThan(before.bodyFatPercent);
    // And it can show lean mass held while weight fell.
    expect(after.fatFreeMassKg).toBeGreaterThan(before.fatFreeMassKg - 1);
  });

  it("refuses a measurement that cannot be a person", () => {
    expect(estimateBodyComposition({ ...her, neckCm: 200 })).toBeNull();
    expect(estimateBodyComposition({ ...her, waistCm: 0 })).toBeNull();
    expect(estimateBodyComposition({ ...her, waistCm: 50, hipCm: 60, neckCm: 45 })).toBeNull();
  });
});

suite("the floor it exists to compute", () => {
  it("is 30 kcal per kg of fat-free mass", () => {
    // Below this is clinical low energy availability: bone density and
    // menstrual function, not a slower week of fat loss.
    expect(energyFloorKcal(50)).toBe(1500);
    expect(energyFloorKcal(45.5)).toBe(1365);
  });

  it("gives a heavier lean mass a higher floor", () => {
    expect(energyFloorKcal(55)).toBeGreaterThan(energyFloorKcal(45));
  });
});
