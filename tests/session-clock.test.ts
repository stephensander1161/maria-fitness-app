import { describe as suite, expect, it } from "vitest";
import { clockDuration, DONE_LINES, doneLine, elapsedMs, readableDuration } from "@/lib/session-clock";
import fs from "node:fs";

suite("how long she has been training", () => {
  const start = "2026-09-08T04:00:00.000Z";

  it("runs from the start until now while the session is open", () => {
    expect(elapsedMs(start, Date.parse("2026-09-08T05:30:00.000Z"))).toBe(90 * 60_000);
  });

  it("stops at the finish once there is one", () => {
    const finished = "2026-09-08T05:00:00.000Z";
    // Whatever "now" is, a finished session is as long as it was.
    expect(elapsedMs(start, Date.parse("2026-09-09T00:00:00Z"), finished)).toBe(60 * 60_000);
  });

  it("is nothing at all before she starts, and never negative", () => {
    expect(elapsedMs(null, Date.now())).toBeNull();
    expect(elapsedMs("not a date", Date.now())).toBeNull();
    expect(elapsedMs(start, Date.parse("2026-09-08T03:00:00Z"))).toBe(0);
  });

  it("reads the shortest true thing", () => {
    expect(readableDuration(null)).toBe("—");
    expect(readableDuration(40_000)).toBe("40s");
    expect(readableDuration(48 * 60_000)).toBe("48m");
    expect(readableDuration(84 * 60_000)).toBe("1h 24m");
    expect(readableDuration(120 * 60_000)).toBe("2h 00m");
  });

  it("ticks like a clock while it is running", () => {
    expect(clockDuration(null)).toBe("0:00");
    expect(clockDuration(9_000)).toBe("0:09");
    expect(clockDuration(12 * 60_000 + 4_000)).toBe("12:04");
    expect(clockDuration(3_750_000)).toBe("1:02:30");
  });
});

suite("what it says when she finishes", () => {
  it("has plenty to say and never repeats itself in one list", () => {
    expect(DONE_LINES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(DONE_LINES).size).toBe(DONE_LINES.length);
  });

  it("says the same thing for the whole time one session is on screen", () => {
    // A line that changes while she is reading it is a line she cannot read.
    expect(doneLine("workout-abc")).toBe(doneLine("workout-abc"));
    expect(DONE_LINES).toContain(doneLine("workout-abc"));
  });

  it("uses more than one of them across sessions", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => doneLine(`w${i}`)));
    expect(seen.size).toBeGreaterThan(10);
  });

  it("is about the work, never about her body", () => {
    for (const line of DONE_LINES) {
      expect(line, line).not.toMatch(/\b(fat|skinny|weight|thin|lean|body|beast|savage)\b/i);
    }
  });
});

suite("the session has edges", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("starts and finishes by hand, with the clock in between", () => {
    // "Today" as the session breaks the moment someone trains past midnight:
    // the workout in progress becomes yesterday's, the screen shows an empty
    // new day, and the coach is told there is no session at all.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/function SessionBar/);
    expect(card).toMatch(/action\("start_workout"/);
    expect(card).toMatch(/Start workout/);
    expect(card).toMatch(/Finish workout/);
    // The clock is read under the day's name, not tapped beside the button.
    expect(card).toMatch(/clockDuration\(elapsedMs\(startedAt, now, finishedAt\)\)/);
  });

  it("does not announce every tick of it", () => {
    // The rest countdown once queued ninety uninterruptible announcements.
    const bar = read("components/train-client.tsx");
    const fn = bar.slice(bar.indexOf("function SessionBar"), bar.indexOf("/** 0=Monday"));
    expect(fn).not.toMatch(/aria-live|role="status"/);
    // And it stops ticking once the session is closed.
    expect(fn).toMatch(/if \(!startedAt \|\| finishedAt\) return;/);
  });

  it("carries the length through to the celebration, frozen at the finish", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/setFinishedMs\(elapsedMs\(view\.startedAt, Date\.now\(\), view\.finishedAt\)\)/);
    expect(card).toMatch(/durationMs=\{finishedMs\}/);
    const done = read("components/session-done.tsx");
    expect(done).toMatch(/label="on your feet"/);
    expect(done).toMatch(/\{doneLine\(seed\)\}/);
  });

  it("the clock comes off the workout row, so it survives a reload", () => {
    const views = read("lib/views.ts");
    expect(views).toMatch(/startedAt: workout\?\.startedAt\?\.toISOString\(\) \?\? null/);
    expect(views).toMatch(/finishedAt: workout\?\.completedAt\?\.toISOString\(\) \?\? null/);
  });
});
