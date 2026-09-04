import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { CALORIE_FLOOR, goalDirection, nutritionTargets } from "@/lib/nutrition";
import { proposeTarget } from "@/lib/expenditure";

const read = (p: string) => fs.readFileSync(p, "utf8");

/**
 * The app was written weight-loss-first, and it showed: every starting target
 * subtracted a deficit without ever looking at the goal weight. Someone whose
 * goal was *above* what they weighed was handed the exact opposite of what
 * they had asked for, on day one, with the app calling it their plan.
 */
const her = {
  weightKg: 75, heightIn: 175, age: 35, sex: "male" as const,
  daysPerWeek: 4, units: "metric" as const,
};

suite("which way she is going", () => {
  it("reads a higher goal as gaining and a lower one as losing", () => {
    expect(goalDirection(75, 82)).toBe("gain");
    expect(goalDirection(75, 68)).toBe("lose");
  });

  it("treats a goal at her current weight as holding", () => {
    // "Get to 75" and "stay at 75" are the same request, and it is what most
    // people mean by building muscle.
    expect(goalDirection(75, 75)).toBe("hold");
    expect(goalDirection(75, 75.9)).toBe("hold");
    expect(goalDirection(75, 74.1)).toBe("hold");
  });

  it("does not flip on a rounding difference", () => {
    expect(goalDirection(75, 76.5)).toBe("gain");
    expect(goalDirection(75, 73.5)).toBe("lose");
  });

  it("falls back to losing only when there is no goal at all", () => {
    expect(goalDirection(75, null)).toBe("lose");
    expect(goalDirection(75, undefined)).toBe("lose");
  });
});

suite("the starting target follows the goal", () => {
  it("gives a surplus to someone who wants to gain", () => {
    // The bug, stated as a test: this used to be a deficit.
    const t = nutritionTargets({ ...her, goalWeightKg: 82 });
    expect(t.direction).toBe("gain");
    expect(t.calorieTarget).toBeGreaterThan(t.maintenanceCalories);
  });

  it("keeps that surplus small, because muscle sets the pace", () => {
    // Eating far past the rate muscle is built at adds fat, not speed.
    const t = nutritionTargets({ ...her, goalWeightKg: 82 });
    const over = t.calorieTarget - t.maintenanceCalories;
    expect(over).toBeGreaterThanOrEqual(150);
    expect(over).toBeLessThanOrEqual(500);
    // And smaller than the deficit the same person would get going the other
    // way — the asymmetry is the point.
    const cut = nutritionTargets({ ...her, goalWeightKg: 68 });
    expect(over).toBeLessThan(cut.maintenanceCalories - cut.calorieTarget);
  });

  it("gives maintenance to someone who wants to stay put", () => {
    const t = nutritionTargets({ ...her, goalWeightKg: 75 });
    expect(t.direction).toBe("hold");
    expect(Math.abs(t.calorieTarget - t.maintenanceCalories)).toBeLessThanOrEqual(10);
  });

  it("still gives a deficit to someone who wants to lose", () => {
    const t = nutritionTargets({ ...her, goalWeightKg: 68 });
    expect(t.direction).toBe("lose");
    expect(t.calorieTarget).toBeLessThan(t.maintenanceCalories);
  });

  it("never puts anyone under the floor, whichever way they are going", () => {
    const tiny = { ...her, weightKg: 42, heightIn: 150, age: 70, sex: "female" as const };
    expect(nutritionTargets({ ...tiny, goalWeightKg: 38 }).calorieTarget)
      .toBeGreaterThanOrEqual(CALORIE_FLOOR);
  });

  it("asks for the same protein either way", () => {
    // ~1.6g/kg is the plateau in both directions; moving it with the goal
    // would be inventing a distinction the evidence does not support.
    const gain = nutritionTargets({ ...her, goalWeightKg: 82 });
    const lose = nutritionTargets({ ...her, goalWeightKg: 68 });
    expect(gain.proteinTargetG).toBe(lose.proteinTargetG);
  });
});

suite("the measured check-in follows it too", () => {
  const tdee = 2600;
  const bmr = 1700;

  it("proposes eating above expenditure when she wants to gain", () => {
    const p = proposeTarget(tdee, 75, bmr, { direction: "gain" });
    expect(p.calorieTarget).toBeGreaterThan(tdee);
    expect(p.direction).toBe("gain");
    // A magnitude, never signed: check-in renders it straight onto her screen.
    expect(p.rateKgPerWeek).toBeGreaterThan(0);
    expect(p.note).toMatch(/on\.$/);
  });

  it("proposes eating at expenditure when she wants to hold", () => {
    const p = proposeTarget(tdee, 75, bmr, { direction: "hold" });
    expect(Math.abs(p.calorieTarget - tdee)).toBeLessThanOrEqual(10);
    expect(p.rateKgPerWeek).toBe(0);
  });

  it("still proposes a deficit when she wants to lose", () => {
    const p = proposeTarget(tdee, 75, bmr, { direction: "lose" });
    expect(p.calorieTarget).toBeLessThan(tdee);
    expect(p.direction).toBe("lose");
    expect(p.rateKgPerWeek).toBeGreaterThan(0);
    expect(p.note).toMatch(/off\.$/);
  });

  it("caps gaining harder than losing", () => {
    // Asking to bulk faster is asking to bulk fatter.
    const gain = proposeTarget(tdee, 75, bmr, { direction: "gain", rateKgPerWeek: 1 });
    const lose = proposeTarget(tdee, 75, bmr, { direction: "lose", rateKgPerWeek: 1 });
    expect(gain.limitedBy).toBe("rate");
    expect(lose.limitedBy).toBe("rate");
    expect(Math.abs(gain.rateKgPerWeek)).toBeLessThan(Math.abs(lose.rateKgPerWeek));
  });

  it("keeps the resting-burn floor in every direction", () => {
    const p = proposeTarget(1500, 75, 1800, { direction: "lose" });
    expect(p.calorieTarget).toBeGreaterThanOrEqual(1800);
    expect(p.limitedBy).toBe("bmr");
  });
});

suite("the coach is told which way she is going", () => {
  it("states it in the block the model believes", () => {
    // CLAUDE.md: the state block is the single most effective way to fix a
    // wrong answer, and the most dangerous, because the model believes it.
    const progress = read("lib/progress.ts");
    expect(progress).toMatch(/export async function goalDirectionSignal/);
    expect(progress).toMatch(/SHE WANTS TO GAIN/);
    expect(progress).toMatch(/SHE WANTS TO HOLD/);
    // And it is actually assembled into the prompt.
    const loop = read("lib/agent/loop.ts");
    expect(loop).toMatch(/goalDirectionSignal\(profile\)/);
    expect(loop).toMatch(/\baim\b/);
  });

  it("says so in the persona too, without interpolating anything", () => {
    const system = read("lib/agent/system.ts");
    const persona = system.slice(system.indexOf("const PERSONA"), system.indexOf("export function buildSystem"));
    expect(persona).toMatch(/asking to \*\*gain\*\*/);
    expect(persona).toMatch(/recomposition/i);
    // The frozen half must stay frozen, or the prompt cache dies silently.
    expect(persona).not.toMatch(/new Date\(|Date\.now\(|\$\{/);
  });

  it("passes her goal wherever a first target is built", () => {
    // A caller that forgets it silently gets the weight-loss default back.
    for (const file of ["app/api/onboard/route.ts", "lib/tools/setup.ts", "lib/tools/check-in.ts"]) {
      expect(read(file), `${file} builds targets without her goal`).toMatch(/goalWeightKg:/);
    }
  });
});
