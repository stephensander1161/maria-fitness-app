import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { CARRY_HOURS, trainingDay } from "@/lib/training-day";
import type { ISODate } from "@/lib/date";

suite("a workout that runs past midnight — 2026-09-19", () => {
  /*
    "If I work out past midnight, the GO notification, when new movement
     time, jumps to whatever is in the following day."

    Her calendar day rolled over at 00:00 and everything keyed to it rolled
    with it: the plan on screen, the sets she had just logged, and the GO
    screen, which is seeded from whatever day the Train screen is showing.
  */
  const her = "2026-09-19" as ISODate;
  const at = (iso: string) => new Date(iso);
  const open = (date: string, startedAt: string) => ({ date: date as ISODate, startedAt: at(startedAt) });

  it("stays on the session's day while it is still going", () => {
    // Started 22:30, still logging at 00:20 — that is the same workout.
    expect(trainingDay(her, open("2026-09-18", "2026-09-19T04:30:00Z"), at("2026-09-19T06:20:00Z"))).toBe("2026-09-18");
  });

  it("lets go once the session is older than a night is long", () => {
    const started = "2026-09-19T04:30:00Z";
    const justInside = new Date(Date.parse(started) + (CARRY_HOURS - 0.1) * 3_600_000);
    const justOutside = new Date(Date.parse(started) + (CARRY_HOURS + 0.1) * 3_600_000);
    expect(trainingDay(her, open("2026-09-18", started), justInside)).toBe("2026-09-18");
    // Left running because she forgot to sign off: the next morning is hers.
    expect(trainingDay(her, open("2026-09-18", started), justOutside)).toBe(her);
  });

  it("is her day when nothing is open, or the open one is today's", () => {
    expect(trainingDay(her, null, at("2026-09-19T06:20:00Z"))).toBe(her);
    expect(trainingDay(her, open("2026-09-19", "2026-09-19T06:00:00Z"), at("2026-09-19T06:20:00Z"))).toBe(her);
    // And a day in the future never pulls her forward.
    expect(trainingDay(her, open("2026-09-20", "2026-09-19T06:00:00Z"), at("2026-09-19T06:20:00Z"))).toBe(her);
  });

  it("ignores a session whose clock is ahead of hers", () => {
    // A started_at in the future is a clock disagreement, not a workout.
    expect(trainingDay(her, open("2026-09-18", "2026-09-19T08:00:00Z"), at("2026-09-19T06:20:00Z"))).toBe(her);
  });

  it("is what the Train screen is keyed to, including the GO screen's seed", () => {
    const page = fs.readFileSync("app/train/page.tsx", "utf8");
    expect(page).toMatch(/const day = trainingDay\(her, await openSessionNear\(profile\.id, her\)\);/);
    // The day on screen, what counts as "today" on it, and the targets.
    expect(page).toMatch(/\? \(d as typeof her\) : day;/);
    expect(page).toMatch(/const isToday = on === day;/);
    expect(page).toMatch(/todayTargets\(profile\.id, profile\.units, day\)/);
    expect(page).toMatch(/isFutureDay=\{on > day\}/);
    // …and the rest provider is only seeded on the day she is training on,
    // which is what stopped the GO screen offering tomorrow's movements.
    expect(fs.readFileSync("components/train-client.tsx", "utf8")).toMatch(/if \(!isToday\) return;\s*\n\s*setSession\(/);
  });

  it("only ever looks at today and the day before", () => {
    const lib = fs.readFileSync("lib/training-day.ts", "utf8");
    expect(lib).toMatch(/gte\(workouts\.date, addDays\(her, -1\)\)/);
    expect(lib).toMatch(/isNull\(workouts\.completedAt\)/);
    expect(lib).toMatch(/orderBy\(desc\(workouts\.date\)\)/);
  });
});
