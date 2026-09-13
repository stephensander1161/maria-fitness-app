import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { DAY_BEGINS_HOUR, shouldAskToWeigh } from "@/lib/morning-weigh-in";
import type { ISODate } from "@/lib/date";

const read = (p: string) => fs.readFileSync(p, "utf8");
const today = "2026-09-08" as ISODate;
const ask = (over: Partial<Parameters<typeof shouldAskToWeigh>[0]> = {}) =>
  shouldAskToWeigh({ hour: 8, loggedToday: false, dismissedOn: null, today, ...over });

suite("asking for a weigh-in on the first open of the day", () => {
  it("asks in the morning, when nothing is logged", () => {
    expect(ask()).toBe(true);
    expect(ask({ hour: DAY_BEGINS_HOUR })).toBe(true);
    expect(ask({ hour: 23 })).toBe(true);
  });

  it("never in the small hours — she trains past midnight", () => {
    // A new calendar date arrives in the middle of last night's session, and
    // a full-screen "step on the scale" between two sets is the app
    // interrupting the thing it exists to help with.
    expect(ask({ hour: 0 })).toBe(false);
    expect(ask({ hour: 1 })).toBe(false);
    expect(ask({ hour: DAY_BEGINS_HOUR - 1 })).toBe(false);
  });

  it("not once she has weighed in", () => {
    expect(ask({ loggedToday: true })).toBe(false);
    // Not even later the same day.
    expect(ask({ hour: 20, loggedToday: true })).toBe(false);
  });

  it("not again once she has put it away today", () => {
    expect(ask({ dismissedOn: today })).toBe(false);
    // Yesterday's dismissal is not today's.
    expect(ask({ dismissedOn: "2026-09-07" })).toBe(true);
  });

  it("says no rather than guessing when the hour is unknown", () => {
    // Unknown is not zero, and zero here would read as "the small hours".
    expect(ask({ hour: Number.NaN })).toBe(false);
  });

  it("is off entirely for someone who does not weigh themselves", () => {
    expect(ask({ wanted: false })).toBe(false);
    expect(ask({ wanted: true })).toBe(true);
  });
});

suite("last night, asked in the one moment she knows the answer", () => {
  /*
    Sleep rides along with the weigh-in.

    It is the same kind of question and the same moment: by the evening
    "about seven, I think" is the best anybody can do, and the sleep card on
    Progress was being answered at four in the afternoon or not at all. Sleep
    moves appetite, grip and how hard a set feels by more than most of what
    this app already tracks.
  */
  const prompt = read("components/weigh-in-prompt.tsx");

  it("asks only while it is still outstanding", () => {
    // Asked twice is worse than not asked. The gate reads today's row — a
    // night belongs to the morning she woke, which is today's date.
    const lib = read("lib/views.ts");
    expect(lib).toMatch(/eq\(sleepLogs\.date, today\)/);
    expect(lib).toMatch(/askSleep: sleptToday\.length === 0/);
    expect(read("components/weigh-in-gate.tsx")).toMatch(/askSleep=\{ask\.askSleep\}/);
    expect(prompt).toMatch(/\{askSleep && \(/);
  });

  it("writes nothing she did not say", () => {
    // Unknown is not zero, and a seeded 7.5 tapped past is a night that never
    // happened sitting in the average beside the real ones. The box starts
    // blank and no row is written until she fills it in.
    expect(prompt).toMatch(/useState\(0\)/);
    expect(prompt).toMatch(/blankAtZero/);
    expect(prompt).toMatch(/const sleepGiven = askSleep && hours > 0;/);
    expect(prompt).toMatch(/if \(sleepGiven\) \{/);
  });

  it("keeps the rating optional, and clearable", () => {
    // A night she did not rate is not a night she rated badly — which is why
    // sleep_logs.quality is nullable.
    expect(prompt).toMatch(/setQuality\(on \? null : n\)/);
    expect(prompt).toMatch(/quality === null \? \{\} : \{ quality \}/);
  });

  it("never lets the second question cost her the first", () => {
    // The weigh-in is what this screen is for and it is already written by the
    // time sleep is attempted, so a sleep row that will not save cannot take
    // it down. Both tools upsert on (profile, date), so a retry corrects.
    const weight = prompt.indexOf('action("log_weight"');
    const sleep = prompt.indexOf('action("log_sleep"');
    expect(weight).toBeGreaterThan(-1);
    expect(sleep).toBeGreaterThan(weight);
    expect(read("lib/tools/sleep.ts")).toMatch(/onConflictDoUpdate/);
  });

  it("writes through the registry, like the weight beside it", () => {
    expect(prompt).toMatch(/action(<[^>]*>)?\("log_sleep"/);
  });
});

suite("the weigh-in prompt is wired to her clock, not the server's", () => {
  it("takes her local hour, in her own timezone", () => {
    const lib = read("lib/views.ts");
    expect(lib).toMatch(/timeZone: profile\.timezone/);
    // Her today, not the server's — the rule this codebase repeats.
    expect(lib).toMatch(/profileToday\(profile\)/);
    // And the read lives in lib, because a component that imports the
    // database is a component that can write to it.
    expect(read("components/weigh-in-gate.tsx")).not.toMatch(/@\/lib\/db/);
    // And the pure rule stays pure: the browser imports it for the storage
    // key, and one database import there drags Postgres into the bundle.
    expect(read("lib/morning-weigh-in.ts")).not.toMatch(/@\/lib\/db/);
  });

  it("writes through the tool registry like everything else", () => {
    expect(read("components/weigh-in-prompt.tsx")).toMatch(/action(<[^>]*>)?\("log_weight"/);
  });

  it("announces a failure rather than colouring it", () => {
    expect(read("components/weigh-in-prompt.tsx")).toMatch(/role="alert"/);
  });

  it("behaves like the dialog it says it is", () => {
    const p = read("components/weigh-in-prompt.tsx");
    expect(p).toMatch(/useDialog\(/);
    expect(p).toMatch(/aria-modal="true"/);
  });
});
