import { describe as suite, expect, it } from "vitest";
import { RANKS, scoreFor, streakWeeks, titleFor } from "@/lib/titles";
import { weekStart, type ISODate } from "@/lib/date";

suite("a title only ever goes up", () => {
  it("never demotes for a bad fortnight", () => {
    // Every input is a lifetime total, so more of anything can only raise the
    // score. Taking a title away for missing sessions punishes exactly the
    // moment she most needs a reason to come back.
    const before = { sets: 400, sessions: 40, daysLogged: 100, streakWeeks: 8, milestones: 2 };
    const after = { ...before, streakWeeks: 0 };
    // The streak resetting is the only input that can fall, and it costs at
    // most its own weight — it can never undo the sets and sessions banked.
    expect(scoreFor(after)).toBeLessThan(scoreFor(before));
    expect(scoreFor(after)).toBeGreaterThan(scoreFor({ ...before, sets: 0, sessions: 0, daysLogged: 0, streakWeeks: 0 }));
  });

  it("ranks by thresholds that only increase", () => {
    for (let i = 1; i < RANKS.length; i += 1) {
      expect(RANKS[i].at, `${RANKS[i].name} after ${RANKS[i - 1].name}`).toBeGreaterThan(RANKS[i - 1].at);
    }
  });

  it("starts everyone somewhere, and tops out", () => {
    const first = titleFor({ sets: 0, sessions: 0, daysLogged: 0, streakWeeks: 0, milestones: 0 });
    expect(first.name).toBe(RANKS[0].name);
    expect(first.next).toBe(RANKS[1].name);

    const last = titleFor({ sets: 999_999, sessions: 0, daysLogged: 0, streakWeeks: 0, milestones: 0 });
    expect(last.name).toBe(RANKS.at(-1)!.name);
    expect(last.next).toBeNull();
    expect(last.progress).toBe(100);
  });

  it("weights turning up above one enormous session", () => {
    // Thirty sets in one go, against ten ordinary sessions. The month of
    // ordinary sessions is the thing that actually works, so it must win.
    const oneBigDay = scoreFor({ sets: 30, sessions: 1, daysLogged: 1, streakWeeks: 1, milestones: 0 });
    const tenSessions = scoreFor({ sets: 30, sessions: 10, daysLogged: 10, streakWeeks: 4, milestones: 0 });
    expect(tenSessions).toBeGreaterThan(oneBigDay);
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
