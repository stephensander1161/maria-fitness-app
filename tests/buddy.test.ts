import { describe as suite, expect, it } from "vitest";
import {
  bark, condition, fullness, LATE_HOUR, MAX_SCALE, MIN_SCALE, modeFor, SLEEPS_AT, STALE_DAYS, WAKES_AT, type BuddyState,
} from "@/lib/buddy";

const her = (over: Partial<BuddyState> = {}): BuddyState => ({
  sessions14: 4, planned14: 6, daysSinceSession: 1, trainedToday: false,
  proteinG: 120, proteinTargetG: 120, proteinComplete: true, entriesToday: 3,
  weighedToday: true, sessionOpen: false, restToday: false,
  hour: 18, direction: "lose", tone: "plain", ...over,
});

suite("how big he is", () => {
  it("grows with a fortnight that was actually trained", () => {
    expect(condition({ sessions14: 6, planned14: 6 })).toEqual({ condition: "strong", scale: MAX_SCALE });
    expect(condition({ sessions14: 4, planned14: 6 }).condition).toBe("steady");
    expect(condition({ sessions14: 2, planned14: 6 }).condition).toBe("light");
    expect(condition({ sessions14: 0, planned14: 6 })).toEqual({ condition: "light", scale: MIN_SCALE });
  });

  it("nobody starts small", () => {
    // An empty database is not evidence of anything, and greeting a new
    // account with a shrivelled mascot tells someone they have failed at
    // something they have not started.
    expect(condition({ sessions14: 0, planned14: 0 })).toEqual({ condition: "unknown", scale: 1 });
  });

  it("never goes past its own bounds", () => {
    for (const [s, p] of [[99, 1], [0, 1], [1, 99]] as const) {
      const { scale } = condition({ sessions14: s, planned14: p });
      expect(scale).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(scale).toBeLessThanOrEqual(MAX_SCALE);
    }
  });
});

suite("how full he is", () => {
  it("is today's protein against today's target", () => {
    expect(fullness(her({ proteinG: 60, proteinTargetG: 120 }))).toBeCloseTo(0.5);
    expect(fullness(her({ proteinG: 240, proteinTargetG: 120 }))).toBe(1);
  });

  it("refuses to answer rather than showing an empty bar", () => {
    // Nothing logged is not zero protein — she has eaten, she has not written
    // it down. A bar at 0% is the app calling that a failure.
    expect(fullness(her({ entriesToday: 0, proteinG: null }))).toBeNull();
    expect(fullness(her({ proteinG: null }))).toBeNull();
    // And a target nobody has set is not a target of zero.
    expect(fullness(her({ proteinTargetG: null }))).toBeNull();
    expect(fullness(her({ proteinTargetG: 0 }))).toBeNull();
  });

  it("treats every shape of missing as missing, not only null", () => {
    // An absent database column arrives as `undefined`, which is not `null`,
    // so a `=== null` check waved it through and the division produced NaN —
    // a protein bar of NaN% width and a figure with no idea. Found by a probe
    // against a running app, not by reading the code.
    const gone = undefined as unknown as null;
    expect(fullness(her({ proteinTargetG: gone }))).toBeNull();
    expect(fullness(her({ proteinG: gone }))).toBeNull();
    expect(fullness(her({ proteinG: Number.NaN }))).toBeNull();
  });
});

suite("what he says is true, and chosen rather than shuffled", () => {
  it("names the protein gap when there is one, with the number", () => {
    const b = bark(her({ proteinG: 60, proteinTargetG: 120 }));
    expect(b.kind).toBe("protein");
    expect(b.text).toContain("60g");
  });

  it("says nothing about protein she has not logged", () => {
    // The trap this whole file exists for: zero entries summed as zero grams
    // has him telling her she has eaten no protein all day.
    const b = bark(her({ entriesToday: 0, proteinG: null, hour: 9 }));
    expect(b.text).not.toMatch(/\d+g/);
    // Later in the day it is worth a nudge, and it is about the *log*.
    const late = bark(her({ entriesToday: 0, proteinG: null, hour: LATE_HOUR }));
    expect(late.text.toLowerCase()).toContain("log");
  });

  it("notices a gap in training, but never on the first day off", () => {
    expect(bark(her({ daysSinceSession: STALE_DAYS, proteinG: 120 })).kind).toBe("training");
    expect(bark(her({ daysSinceSession: 1, proteinG: 120 })).kind).not.toBe("training");
    // And never at all for someone who has not started: there is no gap to be in.
    expect(bark(her({ daysSinceSession: null, proteinG: 120 })).kind).not.toBe("training");
  });

  it("is deterministic — the same day says the same thing", () => {
    const s = her({ proteinG: 60, proteinTargetG: 120 });
    const seen = new Set(Array.from({ length: 20 }, () => bark(s).text));
    expect(seen.size).toBe(1);
  });

  it("always has something to say", () => {
    const b = bark(her());
    expect(b.text.length).toBeGreaterThan(0);
    // An empty state is not `return null` — a strip that goes blank is
    // indistinguishable from one that is broken.
    for (const tone of ["encouraging", "plain", "hype"] as const) {
      for (const direction of ["lose", "gain", "hold"] as const) {
        expect(bark(her({ tone, direction })).text.length).toBeGreaterThan(0);
      }
    }
  });
});

suite("a voice changes how it is said, never what is true", () => {
  const short = { proteinG: 60, proteinTargetG: 120 };

  it("carries the same number in all three registers", () => {
    for (const tone of ["encouraging", "plain", "hype"] as const) {
      const b = bark(her({ ...short, tone }));
      expect(b.kind, tone).toBe("protein");
      expect(b.text, tone).toContain("60g");
    }
  });

  it("and the blunt one is short, not cruel", () => {
    // The fun voice to write is exactly the one that quietly turns into shame.
    const all: string[] = [];
    for (const tone of ["encouraging", "plain", "hype"] as const) {
      for (const over of [short, { daysSinceSession: 9 }, { entriesToday: 0, proteinG: null }, {}]) {
        all.push(bark(her({ ...over, tone })).text.toLowerCase());
      }
    }
    for (const line of all) {
      expect(line).not.toMatch(/no excuses|lazy|pathetic|weak|fat|shame|disappoint|failure/);
    }
  });
});

suite("what he is doing", () => {
  it("trains when she trains, whatever the hour", () => {
    // The case that makes this a rule rather than a preference: she is in the
    // gym at one in the morning and the mascot is face-down on the floor.
    expect(modeFor({ hour: 1, sessionOpen: true, restToday: false })).toBe("training");
    expect(modeFor({ hour: 23, sessionOpen: true, restToday: true })).toBe("training");
    expect(modeFor({ hour: 10, sessionOpen: true, restToday: true })).toBe("training");
  });

  it("sleeps at night", () => {
    expect(modeFor({ hour: 2, sessionOpen: false, restToday: false })).toBe("asleep");
    expect(modeFor({ hour: WAKES_AT - 1, sessionOpen: false, restToday: false })).toBe("asleep");
    expect(modeFor({ hour: SLEEPS_AT, sessionOpen: false, restToday: false })).toBe("asleep");
    expect(modeFor({ hour: WAKES_AT, sessionOpen: false, restToday: false })).toBe("about");
  });

  it("and on a day with no training in it", () => {
    expect(modeFor({ hour: 11, sessionOpen: false, restToday: true })).toBe("asleep");
    expect(modeFor({ hour: 11, sessionOpen: false, restToday: false })).toBe("about");
  });

  it("stays up rather than guessing when the clock is unreadable", () => {
    // Unknown is not midnight. A NaN hour would otherwise read as "before
    // six" and put him to sleep on a training day.
    expect(modeFor({ hour: Number.NaN, sessionOpen: false, restToday: false })).toBe("about");
  });
});
