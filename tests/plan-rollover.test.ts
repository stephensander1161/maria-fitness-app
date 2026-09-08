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
    expect(src).not.toMatch(/setLogs|workouts/);
    // And the rationale does not travel: it described a week that has been.
    expect(src).toMatch(/rationale: null/);
  });

  it("is copied, not pointed at, so one week can be changed without the rest", () => {
    expect(src).toMatch(/db\.insert\(plans\)/);
    expect(src).toMatch(/db\.insert\(planDays\)/);
    expect(src).toMatch(/db\.insert\(planExercises\)/);
  });

  it("runs before the screens read the week, on both of them", () => {
    expect(code("app/train/page.tsx")).toMatch(/await rollForward\(profile\.id, weekStart\(on\)\)/);
    const plan = code("app/plan/page.tsx");
    expect(plan).toMatch(/await rollForward\(profile\.id, shownWeek\)/);
    expect(plan.indexOf("rollForward")).toBeLessThan(plan.indexOf("weekView("));
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
