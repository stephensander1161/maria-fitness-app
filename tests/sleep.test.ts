import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  formatSleep, parseSleep, sleepAlert, sleepState, sleepTarget, summariseSleep,
  SLEEP_SHORT_MIN, SLEEP_TARGET_DEFAULT_MIN, type SleepNight,
} from "@/lib/sleep";

const night = (date: string, minutes: number, quality: number | null = null): SleepNight =>
  ({ date, minutes, quality, bedAt: null, wakeAt: null, note: null });

suite("a night is a length, not a decimal", () => {
  it("reads the ways she would actually type it", () => {
    for (const said of ["7h30", "7:30", "7.5h", "450m", "450", "7.5"]) {
      expect(parseSleep(said), said).toBe(450);
    }
    expect(parseSleep("8")).toBe(480);
    expect(parseSleep(" 8H ")).toBe(480);
  });

  it("refuses rather than guessing", () => {
    // Same refusal as a portion in a measure the food is not sold in: a number
    // the app invented for a night she mistyped is worse than asking again.
    for (const junk of ["", "ok", "seven", "7h90", "0", "-3", "20h", "2000"]) {
      expect(parseSleep(junk), junk).toBeNull();
    }
  });

  it("writes it back the way people say it", () => {
    expect(formatSleep(450)).toBe("7h 30m");
    expect(formatSleep(480)).toBe("8h");
    expect(formatSleep(45)).toBe("45m");
    // Unknown is not zero, and it does not render as "0h" either.
    expect(formatSleep(null)).toBe("—");
  });
});

suite("short is not the same as under target", () => {
  it("does not nag about a 7h45 night", () => {
    // Flattening the two makes the app complain about a good-enough night,
    // which is how people turn a feature off.
    // 7h45 against an 8h target is on target, not a miss worth mentioning.
    expect(sleepState(465, SLEEP_TARGET_DEFAULT_MIN)).toBe("there");
    expect(sleepState(435, SLEEP_TARGET_DEFAULT_MIN)).toBe("under");
    expect(sleepState(SLEEP_SHORT_MIN - 1, SLEEP_TARGET_DEFAULT_MIN)).toBe("short");
    expect(sleepState(600, SLEEP_TARGET_DEFAULT_MIN)).toBe("long");
    expect(sleepState(null, SLEEP_TARGET_DEFAULT_MIN)).toBe("unknown");
  });

  it("measures against her target, not the default", () => {
    expect(sleepTarget({ sleepTargetMinutes: 540 })).toBe(540);
    expect(sleepTarget({ sleepTargetMinutes: null })).toBe(SLEEP_TARGET_DEFAULT_MIN);
    expect(sleepTarget({})).toBe(SLEEP_TARGET_DEFAULT_MIN);
    // A nine-hour target makes 7h45 a miss where an eight-hour one does not.
    expect(sleepState(465, 540)).toBe("under");
    expect(sleepState(465, 480)).toBe("there");
  });
});

suite("unknown is not zero", () => {
  it("refuses to average a window nobody wrote down", () => {
    // Three rows out of fourteen is a rumour. Reported in the same typeface as
    // a real figure it becomes "you slept 5h this fortnight" — which is the
    // direction this app must never be wrong in.
    const thin = [night("2026-09-01", 300), night("2026-09-02", 320)];
    const s = summariseSleep(thin, 480, 14);
    expect(s.meanMinutes).toBeNull();
    expect(s.confidence).toBe("under-logged");
    expect(s.logged).toBe(2);
    expect(s.nights).toBe(14);
  });

  it("averages the nights it has, not the nights it does not", () => {
    const week = [
      night("2026-09-01", 400), night("2026-09-02", 500), night("2026-09-03", 480),
      night("2026-09-04", 420), night("2026-09-05", 460), night("2026-09-06", 440),
    ];
    const s = summariseSleep(week, 480, 7);
    // Mean over six logged nights (2700/6), never over seven.
    expect(s.meanMinutes).toBe(450);
    expect(s.confidence).toBe("good");
  });

  it("calls a half-logged window thin, but still answers", () => {
    const half = [night("a", 480), night("b", 460), night("c", 470), night("d", 450)];
    const s = summariseSleep(half, 480, 7);
    expect(s.confidence).toBe("thin");
    expect(s.meanMinutes).toBe(465);
  });

  it("counts short nights against the floor, not her target", () => {
    const week = [night("a", 419), night("b", 421), night("c", 300), night("d", 480)];
    expect(summariseSleep(week, 540, 4).shortNights).toBe(2);
  });

  it("never lets a long night pay back a short one", () => {
    // Twelve hours on Saturday does not undo four on Wednesday, and netting
    // them off would report a clean week.
    const s = summariseSleep([night("a", 240), night("b", 720), night("c", 480)], 480, 3);
    expect(s.debtMinutes).toBe(240);
  });

  it("a missing quality rating is not a bad one", () => {
    const s = summariseSleep([night("a", 480, 4), night("b", 470, null), night("c", 460, 2)], 480, 3);
    // Mean of the two she rated, not of two ratings and a zero.
    expect(s.meanQuality).toBe(3);
    expect(summariseSleep([night("a", 480), night("b", 470), night("c", 460)], 480, 3).meanQuality).toBeNull();
  });
});

suite("saying something only when it is worth saying", () => {
  const good = summariseSleep(
    Array.from({ length: 12 }, (_, i) => night(`d${i}`, 470)), 480, 14,
  );

  it("stays quiet on an ordinary week", () => {
    // A screen that says something about sleep every time she opens it is one
    // she reads past — and then the week it matters, she reads past that too.
    expect(sleepAlert(good, 470)).toBeNull();
  });

  it("speaks up after a run of short nights", () => {
    const rough = summariseSleep(
      Array.from({ length: 12 }, (_, i) => night(`d${i}`, 380)), 480, 14,
    );
    expect(sleepAlert(rough, 380)).toMatch(/short nights/);
  });

  it("will not judge a window it refused to average", () => {
    const thin = summariseSleep([night("a", 300)], 480, 14);
    // No mean, no verdict. The one exception is a genuinely alarming night,
    // which stands on its own without needing a window.
    expect(sleepAlert(thin, null)).toBeNull();
    expect(sleepAlert(thin, 240)).toMatch(/Train if you want to/);
  });

  it("never blames her for it", () => {
    const rough = summariseSleep(Array.from({ length: 12 }, (_, i) => night(`d${i}`, 360)), 480, 14);
    for (const line of [sleepAlert(rough, 360), sleepAlert(rough, 240)]) {
      expect(line).not.toMatch(/should have|need to|discipline|excuse|lazy/i);
    }
  });
});

suite("the filing rule is written down where it can be read", () => {
  it("says a night belongs to the morning she woke, in the schema and the tools", () => {
    // The model is otherwise fifty-fifty on it, and a night filed one day
    // early is missing from today and doubled yesterday.
    expect(fs.readFileSync("lib/db/schema.ts", "utf8"))
      .toMatch(/A night is filed under the morning she woke up/);
    const tools = fs.readFileSync("lib/tools/sleep.ts", "utf8");
    expect(tools).toMatch(/MORNING SHE WOKE UP/);
    // Every date default comes off her timezone, never the server's.
    expect(tools).toMatch(/todayForProfile\(profileId\)/);
    expect(tools).not.toMatch(/[^e]today\(\)/);
  });
});
