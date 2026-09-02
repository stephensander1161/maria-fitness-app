import { describe as suite, expect, it } from "vitest";
import { summariseNutrition, type NutritionDay } from "@/lib/progress";

/**
 * The classification, not the query. Every bug worth catching here is a
 * conclusion drawn from a day she simply did not log.
 */
const day = (date: string, calories: number | null, proteinG: number | null = null): NutritionDay => ({
  date, logged: calories !== null, calories, proteinG,
  entries: calories === null ? 0 : 1,
  entriesCounted: calories === null ? 0 : 1,
  caloriesComplete: calories !== null,
});

/**
 * A day she logged food on with no figures on any of it — "leftovers",
 * "dinner at Mum's". Logged, but not a total, and emphatically not a zero.
 */
const uncounted = (date: string, entries = 2): NutritionDay => ({
  date, logged: true, calories: 0, proteinG: 0,
  entries, entriesCounted: 0, caloriesComplete: false,
});

/** Some of the day counted, some not: the sum is a floor. */
const partial = (date: string, counted: number): NutritionDay => ({
  date, logged: true, calories: counted, proteinG: null,
  entries: 3, entriesCounted: 2, caloriesComplete: false,
});

const window = (values: (number | null)[]) =>
  values.map((v, i) => day(`2026-08-${String(i + 1).padStart(2, "0")}`, v));

suite("reading a fortnight of eating", () => {
  // The bug this exists to prevent. Averaging unlogged days as zero invents a
  // deficit she never ran, and the app would congratulate her for forgetting
  // to log.
  it("averages counted days only, never counting an unlogged day as zero", () => {
    const r = summariseNutrition(window([1500, null, 1500, null, 1500, null, 1500, 1500]), 1600, 120);
    expect(r.avgCalories).toBe(1500);
    expect(r.daysLogged).toBe(5);
  });

  it("refuses to judge a window that is mostly unlogged", () => {
    const r = summariseNutrition(window([1400, 1400, null, null, null, null, null, null]), 1600, 120);
    expect(r.trend).toBe("under-logged");
    expect(r.headline).toContain("not enough here to judge");
  });

  it("says nothing at all when nothing is logged", () => {
    const r = summariseNutrition(window([null, null, null, null]), 1600, 120);
    expect(r.trend).toBe("no-data");
    expect(r.avgCalories).toBeNull();
    expect(r.daysOnTarget).toBe(0);
  });

  it("calls a consistent overshoot over", () => {
    const r = summariseNutrition(window([2200, 2300, 2100, 2400]), 1600, 120);
    expect(r.trend).toBe("over");
    expect(r.daysOnTarget).toBe(0);
  });

  it("counts days at or under the target, boundary included", () => {
    const r = summariseNutrition(window([1600, 1500, 1700, 1601]), 1600, 120);
    expect(r.daysOnTarget).toBe(2);
  });

  // 5% of headroom: these are her own estimates of what she ate, not weighed
  // laboratory values, and a 30 kcal overshoot is not a finding.
  it("does not call a rounding-error overshoot a problem", () => {
    const r = summariseNutrition(window([1620, 1630, 1610, 1600]), 1600, 120);
    expect(r.trend).toBe("on-track");
  });

  it("still reports an average when no target is set", () => {
    const r = summariseNutrition(window([1500, 1700, 1600, 1600]), null, null);
    expect(r.trend).toBe("on-track");
    expect(r.avgCalories).toBe(1600);
    expect(r.headline).toContain("No calorie target set");
  });

  it("averages protein across logged days too", () => {
    const days = [day("2026-08-01", 1500, 100), day("2026-08-02", null, null), day("2026-08-03", 1500, 140)];
    const r = summariseNutrition(days, 1600, 120);
    expect(r.avgProteinG).toBe(120);
  });

  it("keeps every day in the window so the chart can draw the gaps", () => {
    const r = summariseNutrition(window([1500, null, null, 1500]), 1600, 120);
    expect(r.days).toHaveLength(4);
    expect(r.days.filter((d) => !d.logged)).toHaveLength(2);
    expect(r.windowDays).toBe(4);
  });
});

/**
 * The second half of the same bug, one level down. An unlogged day is not a
 * zero-calorie day — and neither is a day of "leftovers, a coffee, dinner at
 * Mum's", which is three real entries carrying no figures at all.
 *
 * Counted as zeros they averaged in, dragged the mean down, and every one of
 * them was reported as a day at or under target. The coach then congratulated
 * her on a deficit she never ran and could not explain why the scale had not
 * moved.
 */
suite("food logged in words is not zero calories", () => {
  it("keeps a figureless day out of the average entirely", () => {
    const days = [
      day("2026-08-01", 1500), day("2026-08-02", 1500), day("2026-08-03", 1500),
      day("2026-08-04", 1500), day("2026-08-05", 1500), day("2026-08-06", 1500),
      uncounted("2026-08-07"), uncounted("2026-08-08"),
    ];
    const r = summariseNutrition(days, 1600, 120);
    expect(r.avgCalories).toBe(1500);
    expect(r.daysCounted).toBe(6);
    expect(r.daysLogged).toBe(8);
  });

  it("never reports a figureless day as under target", () => {
    const days = [
      day("2026-08-01", 1500), day("2026-08-02", 1500), day("2026-08-03", 1500),
      day("2026-08-04", 1500), uncounted("2026-08-05"), uncounted("2026-08-06"),
      uncounted("2026-08-07"), uncounted("2026-08-08"),
    ];
    const r = summariseNutrition(days, 1600, 120);
    // Four, not eight: the zeros used to sail under the target as successes.
    expect(r.daysOnTarget).toBe(4);
  });

  it("says so when food is logged every day but none of it is counted", () => {
    const r = summariseNutrition(
      ["01", "02", "03", "04"].map((d) => uncounted(`2026-08-${d}`)), 1600, 120,
    );
    expect(r.trend).toBe("under-logged");
    expect(r.avgCalories).toBeNull();
    expect(r.headline).toContain("none of it carries");
    // Emphatically not "you averaged 0 kcal".
    expect(r.headline).not.toMatch(/\b0 kcal/);
  });

  it("counts a partly-counted day as not counted, and says how many", () => {
    const days = [
      day("2026-08-01", 1500), day("2026-08-02", 1500), day("2026-08-03", 1500),
      partial("2026-08-04", 900), partial("2026-08-05", 800),
      day("2026-08-06", 1500), day("2026-08-07", 1500), day("2026-08-08", 1500),
    ];
    const r = summariseNutrition(days, 1600, 120);
    expect(r.avgCalories).toBe(1500);
    expect(r.daysCounted).toBe(6);
    expect(r.headline).toContain("2 more days have food logged without figures");
  });
});
