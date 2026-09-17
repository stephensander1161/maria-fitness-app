import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const code = (p: string) => read(p).split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

/**
 * A plan was a single week, and on Monday morning it stopped existing.
 * Nobody trains like that: a programme is a shape you repeat.
 */
suite("the week carries forward", () => {
  const src = code("lib/plan-rollover.ts");

  it("does nothing when the week already has a plan", () => {
    // Every call after the first, and the reason this can sit in a page load.
    expect(src).toMatch(/if \(already\) return false;/);
  });

  it("inherits the most recent week *before* this one", () => {
    // Not simply the latest: stepping back to an empty week in the past
    // should inherit what she was doing then, not what she is doing now.
    expect(src).toMatch(/lt\(plans\.weekStart, week\)/);
    expect(src).toMatch(/orderBy\(desc\(plans\.weekStart\)\)/);
  });

  it("copies the shape and none of the history", () => {
    // Targets, rest and notes travel; nothing logged does, because the copy
    // is a plan for a week that has not happened.
    for (const field of ["targetSets", "targetReps", "targetWeightKg", "restSeconds", "sortOrder"]) {
      expect(src, field).toContain(field);
    }
    // The copy itself never reads logs; `setLogs`/`workouts` appear in the
    // file only where propagateForward decides which weeks are still blank.
    const copy = src.slice(src.indexOf("async function copyWeek"), src.indexOf("export async function propagateForward"));
    expect(copy).not.toMatch(/setLogs|workouts/);
    // And the rationale does not travel: it described a week that has been.
    expect(src).toMatch(/rationale: null/);
  });

  it("is copied, not pointed at, so one week can be changed without the rest", () => {
    expect(src).toMatch(/db\.insert\(plans\)/);
    expect(src).toMatch(/db\.insert\(planDays\)/);
    expect(src).toMatch(/db\.insert\(planExercises\)/);
  });

  it("propagates a template applied to a week too", () => {
    // apply_template and onboarding both go through instantiateWorkoutPlan.
    const t = read("lib/templates.ts");
    const fn = t.slice(t.indexOf("export async function instantiateWorkoutPlan"), t.indexOf("export async function instantiateMealPlan"));
    expect(fn).toMatch(/await propagateForward\(profileId, weekStart\)/);
  });

  it("propagates an edit to every later week she has not trained yet", () => {
    /*
      "When I change my training day, for example swapping a movement, it
       should update the plan and update for all future days, not a one-off.
       I keep having to change the plan week to day." And: "I edited next
       Wed to be right, went to the following Wednesday and it was still the
       old way" — a week already copied forward kept its old shape.

      So every tool that writes plan days or plan exercises has to call
      `propagateForward` for the week it changed. This walks the tool files
      and fails on any that writes the plan without it — the same shape as
      the tool-coverage test, for the same reason: the one that forgets is
      the one that gets reported.
    */
    const writes = /db\.(insert|update|delete)\((planDays|planExercises)\)/;
    for (const file of ["lib/tools/training.ts", "lib/tools/swaps.ts"]) {
      const src = read(file);
      // Split into tools on `name: "` and check each that writes the plan.
      const tools = src.split(/(?=\n\s*name: ")/);
      const offenders = tools
        .filter((t) => writes.test(t))
        .filter((t) => !/propagateForward\(/.test(t))
        .map((t) => /name: "([a-z_]+)"/.exec(t)?.[1] ?? "?")
        // Reads that merely *name* a plan write in a string do not count.
        .filter((n) => !["get_plan", "get_week_review"].includes(n));
      expect(offenders, `${file}: plan writes without propagateForward`).toEqual([]);
    }
    const rollover = read("lib/plan-rollover.ts");
    // A week with sets in it is a record, not a template: left exactly as it is.
    expect(rollover).toMatch(/if \(Number\(logged\?\.n \?\? 0\) > 0\) continue;/);
    // Only later weeks, never the edited one or the ones before it.
    expect(rollover).toMatch(/gt\(plans\.weekStart, week\)/);
  });

  it("runs before the screens read the week, on both of them", () => {
    expect(code("app/train/page.tsx")).toMatch(/await rollForward\(profile\.id, weekStart\(on\)\)/);
    const plan = code("app/plan/page.tsx");
    expect(plan).toMatch(/await rollForward\(profile\.id, shownWeek\)/);
    expect(plan.indexOf("rollForward")).toBeLessThan(plan.indexOf("weekView("));
    /*
      And the food week with it — "the plans should just carry over week to
      week, unless explicitly changed". Eat is where it shows first, because
      the calorie and protein targets live on the meal plan row: a week nobody
      had planned had no target at all, and a null target draws no bar.
    */
    expect(plan).toMatch(/await rollMealsForward\(profile\.id, shownWeek\)/);
    const eat = code("app/eat/page.tsx");
    expect(eat).toMatch(/await rollMealsForward\(profile\.id, weekStart\(on\)\)/);
    expect(eat.indexOf("rollMealsForward")).toBeLessThan(eat.indexOf("dayFoodView("));
  });
});

suite("a week at a time", () => {
  const plan = code("components/plan-client.tsx");

  it("steps forward and back, and offers the way home", () => {
    expect(plan).toMatch(/‹ Previous/);
    expect(plan).toMatch(/Next ›/);
    expect(plan).toMatch(/Back to this week/);
    expect(plan).toMatch(/w=\$\{next\.w \?\? shownWeek\}/);
  });

  it("does not call another week's Tuesday today", () => {
    // "Today" only means today on the week that contains it.
    expect(plan).toMatch(/const onThisWeek = shownWeek === thisWeek/);
    expect(plan).toMatch(/const isToday = onThisWeek && day === week\.todayIndex/);
    expect(plan).toMatch(/today=\{onThisWeek \? week\.todayIndex : -1\}/);
  });

  it("only accepts a real date, and lands it on a Monday", () => {
    const page = code("app/plan/page.tsx");
    expect(page).toMatch(/\\d\{4\}-\\d\{2\}-\\d\{2\}/);
    expect(page).toMatch(/const shownWeek = weekStart\(asked\)/);
  });
});
