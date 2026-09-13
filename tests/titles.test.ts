import { describe as suite, expect, it } from "vitest";
import { RANKS, scoreFor, streakWeeks, titleFor } from "@/lib/titles";
import { weekStart, type ISODate } from "@/lib/date";

const NOTHING = {
  sets: 0, sessions: 0, missedSessions: 0,
  daysOnTarget: 0, daysOver: 0, daysUncounted: 0,
  streakWeeks: 0, milestones: 0,
};

suite("a title is earned, not accumulated", () => {
  it("costs her a day that went over the target", () => {
    // The whole point of the change: the score used to go up for *logging*,
    // whatever the day looked like, so a fortnight in the red read exactly
    // like a fortnight on plan.
    const onPlan = { ...NOTHING, daysOnTarget: 10 };
    const inTheRed = { ...NOTHING, daysOver: 10 };
    expect(scoreFor(onPlan)).toBeGreaterThan(0);
    expect(scoreFor(inTheRed)).toBeLessThan(0);
  });

  it("costs her a planned session that came and went", () => {
    const turnedUp = { ...NOTHING, sessions: 4 };
    const threeOfFour = { ...NOTHING, sessions: 3, missedSessions: 1 };
    expect(scoreFor(threeOfFour)).toBeLessThan(scoreFor(turnedUp));
    // …but three out of four is still a good week, and the number has to say
    // so. A miss that cancels a session outright makes the bar unmovable for
    // anyone with a life.
    expect(scoreFor(threeOfFour)).toBeGreaterThan(0);
  });

  it("neither credits nor punishes a day nobody could count", () => {
    // "Leftovers", "dinner at Mum's" — honest entries about meals nobody
    // measured. Unknown is not zero and it is not a failure: the small credit
    // for logging, and no judgement on top. Scoring it as a good day would
    // reward vagueness; scoring it as a bad one would punish honesty.
    const vague = scoreFor({ ...NOTHING, daysUncounted: 10 });
    expect(vague).toBeGreaterThan(0);
    expect(vague).toBeLessThan(scoreFor({ ...NOTHING, daysOnTarget: 10 }));
    expect(vague).toBeGreaterThan(scoreFor({ ...NOTHING, daysOver: 10 }));
  });

  it("ranks by thresholds that only increase", () => {
    for (let i = 1; i < RANKS.length; i += 1) {
      expect(RANKS[i].at, `${RANKS[i].name} after ${RANKS[i - 1].name}`).toBeGreaterThan(RANKS[i - 1].at);
    }
  });

  it("starts everyone somewhere, and tops out", () => {
    const first = titleFor(NOTHING);
    expect(first.name).toBe(RANKS[0].name);
    expect(first.next).toBe(RANKS[1].name);

    const last = titleFor({ ...NOTHING, sets: 999_999 });
    expect(last.name).toBe(RANKS.at(-1)!.name);
    expect(last.next).toBeNull();
    expect(last.progress).toBe(100);
  });

  it("weights turning up above one enormous session", () => {
    // Thirty sets in one go, against ten ordinary sessions. The month of
    // ordinary sessions is the thing that actually works, so it must win.
    const oneBigDay = scoreFor({ ...NOTHING, sets: 30, sessions: 1, daysOnTarget: 1, streakWeeks: 1 });
    const tenSessions = scoreFor({ ...NOTHING, sets: 30, sessions: 10, daysOnTarget: 10, streakWeeks: 4 });
    expect(tenSessions).toBeGreaterThan(oneBigDay);
  });
});

suite("a title is never taken away", () => {
  it("holds the name at the highest rank she has been told about", () => {
    // The score falls now — that is the point — and the name must not. Greeting
    // her one morning with a smaller title than the one the app congratulated
    // her on is the most demoralising thing this screen could do.
    const collapsed = { ...NOTHING, daysOver: 40, missedSessions: 20 };
    expect(scoreFor(collapsed)).toBeLessThan(0);
    expect(titleFor(collapsed, RANKS[6].at).name).toBe(RANKS[6].name);
    // Unfloored, the same numbers land at the bottom.
    expect(titleFor(collapsed).name).toBe(RANKS[0].name);
  });

  it("walks the bar back toward the title she holds", () => {
    // Stalled and reversing is what makes it a measurement. A bar that only
    // ever creeps forward is measuring nothing.
    const floor = RANKS[3].at;
    const good = titleFor({ ...NOTHING, sets: RANKS[4].at - 1 }, floor);
    const bad = titleFor({ ...NOTHING, sets: RANKS[3].at, daysOver: 8 }, floor);
    expect(bad.name).toBe(good.name);
    expect(bad.progress).toBeLessThan(good.progress);
    expect(bad.progress).toBeGreaterThanOrEqual(0);
  });

  it("never reports a negative bar", () => {
    expect(titleFor({ ...NOTHING, daysOver: 99 }, RANKS[5].at).progress).toBe(0);
  });
});

suite("no title is a joke at her expense", () => {
  it("says nothing about her body, her weight or her pace", () => {
    // The fun voice is exactly the one that quietly turns into shame. These
    // are about the doing — a bar that got heavier, a habit that stuck.
    const banned = /fat|skinny|slow|lazy|weak|chubby|heavy set|beach body|shred|before and after|diet/i;
    for (const r of RANKS) {
      expect(r.name, r.name).not.toMatch(banned);
      expect(r.blurb, r.name).not.toMatch(banned);
    }
  });

  it("gives every rank something to say", () => {
    for (const r of RANKS) {
      expect(r.name.length).toBeGreaterThan(2);
      expect(r.blurb.length).toBeGreaterThan(10);
    }
    expect(new Set(RANKS.map((r) => r.name)).size).toBe(RANKS.length);
  });
});

suite("the streak counts weeks, not readings", () => {
  const w = (d: string) => weekStart(d as ISODate);

  it("counts back through consecutive trained weeks", () => {
    const dates = ["2026-08-31", "2026-08-25", "2026-08-18"] as ISODate[];
    expect(streakWeeks(dates, w, w("2026-08-31"))).toBe(3);
  });

  it("does not break a streak just because this week has not happened yet", () => {
    // Monday morning is not a lapse.
    const dates = ["2026-08-25", "2026-08-18"] as ISODate[];
    expect(streakWeeks(dates, w, w("2026-08-31"))).toBe(2);
  });

  it("stops at a genuinely missed week", () => {
    const dates = ["2026-08-25", "2026-08-11"] as ISODate[];
    expect(streakWeeks(dates, w, w("2026-08-31"))).toBe(1);
  });
});
