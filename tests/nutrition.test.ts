import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  CALORIE_FLOOR, directionMatchesGoal, FIBRE_TARGET_G, fibreForDay, nutritionTargets,
  proteinForCalories, targetDirection,
} from "@/lib/nutrition";

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

suite("does the target point where she is going", () => {
  it("calls a clear surplus a surplus and a clear deficit a deficit", () => {
    expect(targetDirection(2800, 2100)).toBe("surplus");
    expect(targetDirection(1500, 2100)).toBe("deficit");
  });

  // Estimation noise must not be reported as a surplus: maintenance is a
  // Mifflin-St Jeor estimate, not a measurement.
  it("treats a small difference as maintenance", () => {
    expect(targetDirection(2100, 2100)).toBe("maintenance");
    expect(targetDirection(2200, 2100)).toBe("maintenance");
    expect(targetDirection(2000, 2100)).toBe("maintenance");
  });

  // The case that motivated this: a 2800 kcal plan on a profile trying to
  // lose was accepted with nothing but a 1200 floor to stop it.
  it("catches a surplus set against a weight-loss goal", () => {
    expect(directionMatchesGoal("surplus", 81.6, 66)).toBe(false);
    expect(directionMatchesGoal("deficit", 81.6, 66)).toBe(true);
  });

  it("wants a surplus when she is trying to gain", () => {
    expect(directionMatchesGoal("surplus", 66, 75)).toBe(true);
    expect(directionMatchesGoal("deficit", 66, 75)).toBe(false);
  });

  it("wants maintenance once she is at goal", () => {
    expect(directionMatchesGoal("maintenance", 66.2, 66)).toBe(true);
    expect(directionMatchesGoal("deficit", 66.2, 66)).toBe(false);
  });

  it("says nothing when it cannot tell", () => {
    expect(directionMatchesGoal("deficit", null, 66)).toBeNull();
    expect(directionMatchesGoal("deficit", 81, null)).toBeNull();
  });

  it("exposes maintenance alongside the target", () => {
    const t = nutritionTargets({
      weightKg: 81.6, heightIn: 66, age: 32, sex: "female", daysPerWeek: 3, units: "imperial",
    });
    expect(t.maintenanceCalories).toBeGreaterThan(t.calorieTarget);
    expect(targetDirection(t.calorieTarget, t.maintenanceCalories)).toBe("deficit");
  });
});


suite("protein scaled to her portion", () => {
  it("scales by calories, because protein per calorie is the food", () => {
    // 100g cheddar: 416 kcal, 25g protein. Her 300 kcal of it is 18g.
    expect(proteinForCalories(25, 416, 300)).toBe(18);
    // The reference portion itself comes back unchanged.
    expect(proteinForCalories(30, 212, 212)).toBe(30);
  });

  it("refuses rather than guessing when the scaling is nonsense", () => {
    // Nothing to divide by. This is the branch that stops a lookup which
    // answered with an error — no kcal — writing a protein figure anyway.
    expect(proteinForCalories(25, 0, 300)).toBeNull();
    expect(proteinForCalories(25, 416, 0)).toBeNull();
    // Ten times out is not the same food, or a calorie figure with a digit
    // too many. An empty box she fills in beats a wrong number she trusts.
    expect(proteinForCalories(25, 416, 9000)).toBeNull();
    expect(proteinForCalories(25, 416, 10)).toBeNull();
  });
});

suite("every macro says what it knows", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");
  const views = read("lib/views.ts");

  it("carbs and fat are floors when an entry has no figure, like calories and fibre", () => {
    // A meal typed in words has no macro split. Counting it as zero grams of
    // fat is the same lie as counting it as zero calories — which this app
    // has already shipped once, and told her she had run a deficit for it.
    expect(views).toMatch(/carbsComplete: rows\.length > 0 && rows\.every\(\(r\) => r\.carbsG !== null\)/);
    expect(views).toMatch(/fatComplete: rows\.length > 0 && rows\.every\(\(r\) => r\.fatG !== null\)/);
  });

  it("and the screen writes the ≥ when they are", () => {
    // The grid of five numbers is gone — the bars are the tally now — so each
    // macro's `complete` flag has to reach the bar instead, and the bar is
    // what writes the ≥.
    const eat = read("components/today-food.tsx");
    for (const macro of ["caloriesComplete", "carbsComplete", "fatComplete", "fibreComplete"]) {
      expect(eat, macro).toContain(`complete: day.${macro}`);
    }
    expect(read("components/macro-bars.tsx")).toMatch(/\{b\.complete \? "" : "≥"\}/);
  });

  it("shows all five on the day and on a meal", () => {
    const eat = read("components/today-food.tsx");
    for (const label of ["Calories", "Protein", "Carbs", "Fat", "Fibre"]) {
      expect(eat, label).toContain(`label: "${label}"`);
    }
    expect(read("components/meal-row.tsx")).toMatch(/carbsG/);
    expect(read("components/plan-client.tsx")).toMatch(/g carbs · \$\{foodDay\.fatG\}g fat/);
  });

  it("draws the tally once, not as numbers and bars of the same thing", () => {
    // A grid of five figures with the same five bars hidden behind a tap on it
    // is one fact drawn twice, with a control in the way of the better half.
    const eat = read("components/today-food.tsx");
    expect(eat).not.toMatch(/function Stat\(/);
    expect(eat).not.toMatch(/setShowBars/);
  });
});

suite("fibre is a macro like the rest", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("is estimated when the lookup misses, the way carbs and fat are", () => {
    /*
      It was the only macro the coach was forbidden to estimate — "not a
      guess" — while it estimated calories, protein, carbs and fat freely. So
      almost every day was a fibre floor, the screen carried a "≥" and a
      paragraph explaining it, and the explanation was the app apologising for
      a rule it applied to nothing else.

      Unknown is still not zero: `fibreForDay` still counts what it knows and
      says how much of the day that covers, and a meal with no figure still
      makes the day a floor. What changed is that there is usually a figure.
    */
    const tool = read("lib/tools/nutrition.ts");
    const fn = tool.slice(tool.indexOf("fibreG: wholeGramsOptional"));
    expect(fn.slice(0, 400)).toMatch(/Estimate it when the lookup misses/);
    expect(fn.slice(0, 400)).not.toMatch(/not a guess/);
    expect(read("lib/agent/system.ts")).toMatch(/Fibre is a macro like any other/);
  });

  it("still refuses to invent one for a meal nobody described", () => {
    // The floor machinery is untouched — this is about having a number more
    // often, never about pretending to have one.
    const lib = read("lib/nutrition.ts");
    expect(lib).toMatch(/export function fibreForDay/);
    expect(lib).toMatch(/knownFor/);
  });

  it("has a bar rather than a paragraph of apology", () => {
    const eat = read("components/today-food.tsx");
    expect(eat).toContain('key: "fibre"');
    expect(eat).not.toMatch(/Fibre counts only what was looked up by name/);
  });
});
