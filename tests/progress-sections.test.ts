import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const page = fs.readFileSync("app/progress/page.tsx", "utf8");
const section = fs.readFileSync("components/progress-section.tsx", "utf8");
const progress = fs.readFileSync("lib/progress.ts", "utf8");

suite("Progress reads at four sizes, smallest first", () => {
  it("has the four horizons, in ascending order", () => {
    // It was one column of cards in the order they were built, so this
    // morning's weigh-in, last week's missed sessions and a lifetime volume
    // total sat against each other with nothing to say which was which.
    const at = (t: string) => page.indexOf(`title="${t}"`);
    // The first section is named for the day being read — "Today", or the one
    // she stepped back to — so it is matched by the expression, not a literal.
    const today = page.indexOf('title={isToday ? "Today"');
    expect(today).toBeGreaterThan(-1);
    expect(at("This week")).toBeGreaterThan(today);
    expect(at("This month")).toBeGreaterThan(at("This week"));
    expect(at("This year and all time")).toBeGreaterThan(at("This month"));
  });

  it("puts what she can still act on where it needs no scroll", () => {
    // Ascending rather than descending: today is actionable, the long view
    // rewards a scroll rather than demanding one.
    expect(section).toMatch(/Ascending rather than descending on purpose/);
    // The weigh-in is the reason she opens the screen, and it is in Today.
    const today = page.slice(
      page.indexOf('title={isToday ? "Today"'), page.indexOf('title="This week"'),
    );
    expect(today).toMatch(/<WeighIn/);
    expect(today).toMatch(/<MacroBars/);
  });

  it("measurements sit with the month, not with this morning", () => {
    // A tape measure moves on a scale of weeks; a fortnight of weight is
    // mostly water.
    const month = page.slice(page.indexOf('title="This month"'), page.indexOf('title="This year'));
    expect(month).toMatch(/<Measurements/);
    expect(month).toMatch(/lifted this month/);
  });

  it("reads all four windows in one pass over the table", () => {
    // Four date ranges asked separately is four round trips to say one thing.
    const fn = progress.slice(progress.indexOf("export async function trainingTotals"));
    expect(fn.slice(0, 2500)).toMatch(/const within = \(from: string\)/);
    expect(fn.slice(0, 2500)).toMatch(/\.from\(setLogs\)\.innerJoin\(workouts/);
    // Every boundary from *her* today: a month that starts on the server's
    // date starts a day early for anyone west of it.
    expect(fn.slice(0, 2500)).toMatch(/const month = `\$\{asOf\.slice\(0, 7\)\}-01`/);
    expect(fn.slice(0, 2500)).toMatch(/const year = `\$\{asOf\.slice\(0, 4\)\}-01-01`/);
  });
});
