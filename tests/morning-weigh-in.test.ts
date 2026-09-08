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
