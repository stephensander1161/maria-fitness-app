import { describe as suite, expect, it } from "vitest";
import { FAT_FLOOR_G_PER_KG, FAT_SHARE_OF_CALORIES, macroSplit, nutritionTargets } from "@/lib/nutrition";

const kcal = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;

suite("carbs and fat are what is left, not a fourth decision", () => {
  it("adds up to the calorie target it came from", () => {
    // Four numbers set independently is how a target ends up not summing to
    // itself, which is the one thing a person notices immediately.
    for (const [cal, prot, kg] of [[2000, 130, 80], [1600, 110, 65], [2600, 150, 95]] as const) {
      const { carbTargetG, fatTargetG } = macroSplit(cal, prot, kg);
      // Within the rounding to the nearest 5g on two of the three.
      expect(Math.abs(kcal(prot, carbTargetG, fatTargetG) - cal), `${cal}/${prot}`).toBeLessThanOrEqual(35);
    }
  });

  it("never drops fat below what the body needs", () => {
    // Fat carries the fat-soluble vitamins and the substrate for sex hormones,
    // and a very low-fat deficit is a known way to feel terrible for nothing.
    const tight = macroSplit(1200, 140, 90);
    expect(tight.fatTargetG).toBeGreaterThanOrEqual(90 * FAT_FLOOR_G_PER_KG - 5);
  });

  it("takes the share where the share is the bigger of the two", () => {
    const roomy = macroSplit(2800, 120, 70);
    expect(roomy.fatTargetG).toBeCloseTo((2800 * FAT_SHARE_OF_CALORIES) / 9, -1);
  });

  it("never returns a negative carb target", () => {
    // A very high protein target against a small calorie one can eat the whole
    // budget, and a carb target below zero is not a target.
    expect(macroSplit(1000, 200, 100).carbTargetG).toBe(0);
  });

  it("comes back with every target from nutritionTargets", () => {
    const t = nutritionTargets({
      weightKg: 80, goalWeightKg: 75, heightIn: 180, age: 36, sex: "male",
      daysPerWeek: 3, units: "metric", breastfeeding: false,
    });
    expect(t.carbTargetG).toBeGreaterThan(0);
    expect(t.fatTargetG).toBeGreaterThan(0);
    expect(Math.abs(kcal(t.proteinTargetG, t.carbTargetG, t.fatTargetG) - t.calorieTarget)).toBeLessThanOrEqual(35);
  });
});
