import { describe as suite, expect, it } from "vitest";
import { scoreMealTemplate, scoreWorkoutTemplate } from "@/lib/templates";

/**
 * Template selection is what a new user gets on day one, before the coach has
 * said anything. Getting it wrong is a whole first week of the wrong training.
 */
const T = {
  dumbbellBench: { equipment: ["dumbbell", "bench", "bodyweight", "mat"], experience: ["beginner", "returning"], avoids: [], daysPerWeek: 3, sessionMinutes: 45 },
  dumbbellNoBench: { equipment: ["dumbbell", "bodyweight", "mat"], experience: ["beginner", "returning"], avoids: [], daysPerWeek: 3, sessionMinutes: 45 },
  kneeFriendly: { equipment: ["dumbbell", "bodyweight", "mat"], experience: ["beginner", "returning"], avoids: ["knees", "knee"], daysPerWeek: 3, sessionMinutes: 45 },
  bodyweight: { equipment: ["bodyweight", "mat"], experience: ["beginner"], avoids: [], daysPerWeek: 3, sessionMinutes: 30 },
  bands: { equipment: ["resistance band", "bodyweight", "mat"], experience: ["beginner", "returning"], avoids: [], daysPerWeek: 3, sessionMinutes: 35 },
};

const her = (equipment: string[], injuries: string[] = []) => ({
  equipment, injuries, experience: "beginner" as const, daysPerWeek: 3, sessionMinutes: 45,
});

const best = (profile: ReturnType<typeof her>, ...names: (keyof typeof T)[]) =>
  names
    .map((n) => ({ n, s: scoreWorkoutTemplate(T[n], profile) }))
    .sort((a, b) => b.s - a.s)[0].n;

suite("picking her first week", () => {
  // Disqualifying, not a penalty. As a -20 it was outweighed by the day,
  // experience and session bonuses (+23 together), so a template needing a
  // bench she does not own scored +3 and stayed eligible to be chosen.
  it("will not give her a template needing kit she does not own", () => {
    const p = her(["dumbbells", "mat"]);
    expect(scoreWorkoutTemplate(T.dumbbellBench, p)).toBe(-Infinity);
    expect(scoreWorkoutTemplate(T.dumbbellNoBench, p)).toBeGreaterThan(0);
  });

  it("disqualifies on missing kit however well it scores otherwise", () => {
    // Perfect on days, experience and session length — and still ineligible.
    const perfectButUnowned = { ...T.dumbbellBench, daysPerWeek: 3, sessionMinutes: 45 };
    expect(scoreWorkoutTemplate(perfectButUnowned, her(["mat"]))).toBe(-Infinity);
  });

  // The bug this was written for. Every general dumbbell template needed a
  // bench, so someone with dumbbells and a floor — the commonest home setup —
  // got the knee-friendly week by default: squats and lunges deliberately left
  // out, for a knee that was never a problem.
  it("prefers a general week over a restricted one when nothing needs restricting", () => {
    expect(best(her(["dumbbells", "mat"]), "kneeFriendly", "dumbbellNoBench")).toBe("dumbbellNoBench");
  });

  it("still picks the restricted week when the injury is real", () => {
    expect(best(her(["dumbbells", "mat"], ["bad knees"]), "kneeFriendly", "dumbbellNoBench")).toBe("kneeFriendly");
  });

  // The penalty only breaks ties. A restricted week she can perform beats no
  // week at all.
  it("keeps a restricted week positive when it is the only one that fits", () => {
    expect(scoreWorkoutTemplate(T.kneeFriendly, her(["dumbbells", "mat"]))).toBeGreaterThan(0);
  });

  it("uses the kit she actually owns rather than the lowest common denominator", () => {
    expect(best(her(["resistance bands", "mat"]), "bodyweight", "bands")).toBe("bands");
    expect(best(her(["dumbbells", "mat"]), "bodyweight", "dumbbellNoBench")).toBe("dumbbellNoBench");
  });

  it("falls back to bodyweight for someone with nothing", () => {
    expect(best(her([]), "bodyweight", "bands", "dumbbellNoBench")).toBe("bodyweight");
  });

  it("weights days a week above everything else", () => {
    const fourDays = { ...T.dumbbellNoBench, daysPerWeek: 5 };
    const p = her(["dumbbells", "mat"]);
    expect(scoreWorkoutTemplate(T.dumbbellNoBench, p)).toBeGreaterThan(scoreWorkoutTemplate(fourDays, p));
  });
});

const M = {
  quickOmni:  { dietaryTags: [], contains: ["chicken", "eggs", "rice"], baseCalories: 1500, cookingSkill: "minimal" as const },
  homeOmni:   { dietaryTags: [], contains: ["beef mince", "pasta"], baseCalories: 1800, cookingSkill: "minimal" as const },
  vegetarian: { dietaryTags: ["vegetarian"], contains: ["paneer", "lentils"], baseCalories: 1500, cookingSkill: "comfortable" as const },
  highProtein:{ dietaryTags: ["high-protein"], contains: ["chicken", "skyr"], baseCalories: 1600, cookingSkill: "minimal" as const },
};

const eater = (
  dietaryRestrictions: string[] = [], dislikedFoods: string[] = [],
  cookingSkill: "minimal" | "comfortable" | "keen" = "minimal",
) => ({ dietaryRestrictions, dislikedFoods, cookingSkill });

const bestMeal = (p: ReturnType<typeof eater>, target: number, ...names: (keyof typeof M)[]) =>
  names.map((n) => ({ n, s: scoreMealTemplate(M[n], p, target) })).sort((a, b) => b.s - a.s)[0].n;

suite("picking her first week of meals", () => {
  // Same shape as the knee-friendly bug: both weeks sit at 1500 kcal, so the
  // winner came down to whatever order Postgres returned rows in — and an
  // omnivore was being handed the vegetarian week.
  it("does not impose a diet she never asked for", () => {
    expect(bestMeal(eater(), 1500, "vegetarian", "quickOmni")).toBe("quickOmni");
  });

  it("picks the vegetarian week when she is vegetarian", () => {
    expect(bestMeal(eater(["vegetarian"]), 1500, "vegetarian", "quickOmni")).toBe("vegetarian");
    // And the omnivore week is not merely worse, it is ineligible.
    expect(scoreMealTemplate(M.quickOmni, eater(["vegetarian"]), 1500)).toBe(-Infinity);
  });

  // high-protein is a style, not a restriction, and it suits a deficit.
  it("does not treat a style tag as a restriction", () => {
    expect(scoreMealTemplate(M.highProtein, eater(), 1600))
      .toBeGreaterThan(scoreMealTemplate(M.vegetarian, eater(), 1600));
  });

  it("refuses a week built around a food she will not eat", () => {
    expect(scoreMealTemplate(M.quickOmni, eater([], ["chicken"]), 1500)).toBe(-Infinity);
  });

  it("prefers the calorie target it was asked for", () => {
    expect(bestMeal(eater(), 1500, "quickOmni", "homeOmni")).toBe("quickOmni");
    expect(bestMeal(eater(), 1800, "quickOmni", "homeOmni")).toBe("homeOmni");
  });

  // A week she is willing to cook beats a nominally better one she is not.
  it("weighs how much cooking she actually wants to do", () => {
    const keen = eater([], [], "comfortable");
    expect(scoreMealTemplate(M.vegetarian, keen, 1500))
      .toBeGreaterThan(scoreMealTemplate(M.vegetarian, eater(), 1500));
  });
});
