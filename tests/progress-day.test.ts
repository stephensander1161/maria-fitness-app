import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { trendChange, trendOn, type TrendPoint } from "@/lib/trend";

const page = fs.readFileSync("app/progress/page.tsx", "utf8");

suite("the day on screen is the day every card reads", () => {
  it("takes no weigh-in after it", () => {
    // Stepped back to Thursday, the trend card carried Friday's weigh-in and
    // said "Today" over it. The query is what fixes that, not the label.
    expect(page).toMatch(/lte\(weighIns\.date, her\)/);
  });

  it("takes no measurement after it either", () => {
    expect(page).toMatch(/measurementProgress\(profile\.id, u, her\)/);
    const lib = fs.readFileSync("lib/progress.ts", "utf8");
    const fn = lib.slice(lib.indexOf("export async function measurementProgress"));
    expect(fn.slice(0, 1400)).toMatch(/lte\(measurements\.date, asOf\)/);
  });

  it("writes a weigh-in and a night to that day, not to today", () => {
    // Both tools have always taken a date; nothing was passing them one, so
    // logging from Thursday's page filed the reading under Friday.
    expect(page).toMatch(/<WeighIn[\s\S]{0,220}date=\{her\}/);
    expect(page).toMatch(/<SleepCard[\s\S]{0,320}date=\{her\}/);
    expect(fs.readFileSync("components/weigh-in.tsx", "utf8"))
      .toMatch(/"log_weight", \{ weight: value, \.\.\.\(date \? \{ date \} : \{\}\) \}/);
  });

  it("never says today over a day that is not", () => {
    for (const literal of [">Food today<", 'label="lifted today"', '>Today</p>']) {
      expect(page.includes(literal), literal).toBe(false);
    }
    expect(page).toMatch(/isToday \? "Today" : prettyDate\(her\)/);
  });

  it("sizes each food window to the days it has actually had", () => {
    // A month three days old averaged over thirty days reads as almost
    // entirely unlogged and refuses to say anything at all.
    expect(page).toMatch(/const daysThisWeek = dayIndex\(her\) \+ 1/);
    expect(page).toMatch(/nutritionTrend\(profile\.id, daysThisMonth, her\)/);
    expect(page).toMatch(/nutritionTrend\(profile\.id, daysThisYear, her\)/);
  });

  it("shows training, food and body at every horizon", () => {
    // It was training at all four and nothing else — so a week that went well
    // in the kitchen and badly in the gym read as a bad week.
    expect(page.match(/<WindowStats/g)?.length).toBe(3);
  });
});

suite("what the trend moved across a window", () => {
  const series: TrendPoint[] = [
    { date: "2026-09-01", trend: 80, raw: 80 },
    { date: "2026-09-05", trend: 79.4, raw: 79 },
    { date: "2026-09-09", trend: 79, raw: 78.8 },
  ];

  it("reads the line at the last point at or before a day", () => {
    expect(trendOn(series, "2026-09-07")).toBe(79.4);
    expect(trendOn(series, "2026-09-09")).toBe(79);
    // Before her first weigh-in there is no line to read.
    expect(trendOn(series, "2026-08-30")).toBeNull();
  });

  it("measures the change across the window", () => {
    expect(trendChange(series, "2026-09-01", "2026-09-05")).toBe(-0.6);
    // Window opens before her first weigh-in — "this year" for someone who
    // started in March. It measures from the first reading it contains.
    expect(trendChange(series, "2026-08-31", "2026-09-09")).toBe(-1);
  });

  it("refuses when nothing was weighed inside it", () => {
    // One reading before the window and none in it is not a flat week — it is
    // a week nobody measured, and "level" is a claim about it.
    expect(trendChange(series, "2026-09-09", "2026-09-16")).toBeNull();
    expect(trendChange(series, "2026-08-01", "2026-08-20")).toBeNull();
    // …and one reading inside it with nothing before compares a number to
    // itself. That is not "level" either.
    expect(trendChange([series[0]], "2026-08-31", "2026-09-09")).toBeNull();
  });
});
