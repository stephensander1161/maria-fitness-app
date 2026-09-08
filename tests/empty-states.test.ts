import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { emptyMealWeekView, emptyWeekView } from "@/lib/views";
import { DAY_NAMES } from "@/lib/date";

/**
 * The Plan screen went blank for a week that had no plan in it.
 *
 * Not an error, not a crash — `weekView` returned `days: []`, so the week
 * strip had nothing to draw and the day switcher disappeared, and both add
 * buttons were behind `week.exists`. What was left was one button that spends
 * money. Everything anyone would want to do on that screen was gone precisely
 * when they most needed to do it: at the start of a week.
 *
 * The rule these tests hold: **a screen's scaffolding does not depend on its
 * content existing.** An empty week is still seven days you can move between
 * and add to.
 */

const read = (p: string) => fs.readFileSync(p, "utf8");
const code = (p: string) => read(p).split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};

suite("an empty week is still a week", () => {
  it("has all seven days, in order, named", () => {
    const week = emptyWeekView("2026-09-07", "metric", "2026-09-09");
    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.days.map((d) => d.dayName)).toEqual([...DAY_NAMES]);
    // Monday is 0 throughout this app; a week that starts on Sunday here
    // would put every chip on the wrong day.
    expect(week.days[0].dayName).toBe(DAY_NAMES[0]);
  });

  it("says it does not exist without pretending to be nothing", () => {
    const week = emptyWeekView("2026-09-07", "metric", "2026-09-07");
    expect(week.exists).toBe(false);
    expect(week.days.every((d) => d.isRest)).toBe(true);
    expect(week.days.every((d) => d.exercises.length === 0)).toBe(true);
    // No invented title or rationale: nothing has been planned or reasoned
    // about, and prose claiming otherwise is worse than none.
    expect(week.title).toBe("");
    expect(week.rationale).toBeNull();
  });

  it("marks the right day as today, in her week", () => {
    // The strip highlights todayIndex. Wrong here and she is arranging
    // Tuesday while the screen says Monday.
    expect(emptyWeekView("2026-09-07", "metric", "2026-09-07").todayIndex).toBe(0);
    expect(emptyWeekView("2026-09-07", "metric", "2026-09-13").todayIndex).toBe(6);
  });

  it("carries her units, so the screen does not switch to metric when empty", () => {
    expect(emptyWeekView("2026-09-07", "imperial", "2026-09-07").unit).toBe("lb");
    expect(emptyWeekView("2026-09-07", "metric", "2026-09-07").unit).toBe("kg");
  });

  it("the eating half is the same shape, and claims no targets it does not have", () => {
    const meals = emptyMealWeekView("2026-09-07", "imperial", "2026-09-08");
    expect(meals.days).toHaveLength(7);
    expect(meals.days.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(meals.days.every((d) => d.meals.length === 0 && d.calories === 0)).toBe(true);
    expect(meals.exists).toBe(false);
    expect(meals.todayIndex).toBe(1);
    expect(meals.foodUnits).toBe("imperial");
    // Zero means "no target set" — the screen hides the card rather than
    // telling her to eat nothing.
    expect(meals.calorieTarget).toBe(0);
  });

  it("is what the read models actually return, not a shape only the test knows", () => {
    const views = code("lib/views.ts");
    expect(views).toMatch(/if \(!plan\) return emptyWeekView\(week, units, asOf\)/);
    expect(views).toMatch(/if \(!plan\) return emptyMealWeekView\(week, foodUnits, asOf\)/);
  });
});

suite("no read model may hand a screen an empty list of days", () => {
  it("nothing in lib/ returns `days: []`", () => {
    // The whole bug, in three characters. A new week-shaped view that does
    // this starves its screen exactly the way weekView did.
    for (const file of walk("lib")) {
      expect(code(file), `${file} returns an empty day list`).not.toMatch(/days:\s*\[\s*\]/);
    }
  });
});

suite("a screen's controls do not wait for content to exist", () => {
  it("the Plan tab keeps its day switcher and editors on an empty week", () => {
    const plan = code("components/plan-client.tsx");
    // The strip is built from week.days — which is why days: [] emptied it —
    // and nothing between it and the day's editor may branch on `exists`.
    expect(plan).toMatch(/<WeekStrip/);
    expect(plan).not.toMatch(/week\.exists \? \(/);
    expect(plan).not.toMatch(/mealWeek\.exists \? \(/);
    // Asking the coach is offered, not substituted for the screen.
    expect(plan).toMatch(/!week\.exists && \(/);
    expect(plan).toMatch(/Or ask your coach/);
  });

  it("neither Plan nor Train hides an add control behind having a plan", () => {
    const train = code("components/train-client.tsx");
    expect(train).not.toMatch(/hasPlan && editable && <AddExercise/);
    // Every AddExercise on the Train screen is gated on editability only —
    // a past day stays locked, an empty week does not.
    for (const m of train.matchAll(/\{([^{}]*)<AddExercise/g)) {
      expect(m[1], `AddExercise gated on "${m[1].trim()}"`).not.toMatch(/hasPlan|exists/);
    }
    expect(code("components/planned-day.tsx")).toMatch(/<AddExercise/);
  });

  it("adding the first thing starts the week, so the button is never a lie", () => {
    // A button that is shown but whose tool refuses is worse than a hidden
    // one: that combination is what made the coach say it had added a
    // movement when it had not.
    const training = code("lib/tools/training.ts");
    expect(training).toMatch(/async function startEmptyWeek/);
    expect(training).toMatch(/planDayFor\(ctx\.profileId, input, true\)/);
    expect(code("lib/tools/corrections.ts")).toMatch(/db\.insert\(mealPlans\)/);
    // …and only the add paths create. Removing from a week that is not there
    // is nothing, not a reason to make one.
    const remove = training.slice(training.indexOf('name: "remove_exercise_from_day"'));
    expect(remove.slice(0, remove.indexOf("});"))).not.toMatch(/planDayFor\([^)]*true\)/);
  });

  it("shows what she logged even when nothing was planned", () => {
    // The other half of the same fiasco: a set logged on an unplanned day
    // sat in the database under "No workout planned".
    const views = code("lib/views.ts");
    const today = views.slice(views.indexOf("export async function todayView"), views.indexOf("export type WeekView"));
    expect(today).not.toMatch(/if \(!plan\) return base;/);
    expect(today).toMatch(/Freestyle session/);
    // But a day with genuinely nothing on it still reads as empty.
    expect(today).toMatch(/if \(!day && all\.length === 0\)/);
  });
});
