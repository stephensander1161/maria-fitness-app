import { describe as suite, expect, it } from "vitest";
import { summariseNutrition, type NutritionDay } from "@/lib/progress";

/**
 * The classification, not the query. Every bug worth catching here is a
 * conclusion drawn from a day she simply did not log.
 */
const day = (date: string, calories: number | null, proteinG: number | null = null): NutritionDay => ({
  date, logged: calories !== null, calories, proteinG, entries: calories === null ? 0 : 1,
});

const window = (values: (number | null)[]) =>
  values.map((v, i) => day(`2026-08-${String(i + 1).padStart(2, "0")}`, v));

suite("reading a fortnight of eating", () => {
  // The bug this exists to prevent. Averaging unlogged days as zero invents a
  // deficit she never ran, and the app would congratulate her for forgetting
  // to log.
  it("averages logged days only, never counting an unlogged day as zero", () => {
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
