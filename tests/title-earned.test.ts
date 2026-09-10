import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { newRankFor, RANKS, rankNumber, scoreFor } from "@/lib/titles";

const nothing = { sets: 0, sessions: 0, daysLogged: 0, streakWeeks: 0, milestones: 0 };
/** Enough sets to land exactly on a rank's threshold. */
const atScore = (n: number) => ({ ...nothing, sets: n });

suite("telling her the rank went up", () => {
  it("announces the rank she has just crossed into", () => {
    // It changed in silence: the greeting bar simply read something different
    // one morning, and the one thing in this app that says something about her
    // rather than about the app went by unmentioned.
    const second = RANKS[1];
    expect(newRankFor(atScore(second.at), RANKS[0].at)?.name).toBe(second.name);
  });

  it("says nothing when she is still where she was", () => {
    expect(newRankFor(atScore(RANKS[1].at), RANKS[1].at)).toBeNull();
    expect(newRankFor(atScore(RANKS[1].at + 5), RANKS[1].at)).toBeNull();
  });

  it("never celebrates signing up", () => {
    // A new account is already "Just Started" the moment it exists. Confetti
    // for that is the kind of praise that teaches her to ignore the real
    // thing later, so null is stamped silently rather than announced.
    expect(newRankFor(nothing, null)).toBeNull();
    expect(newRankFor(atScore(9_999), null)).toBeNull();
  });

  it("skips straight to where she actually is", () => {
    // Somebody importing months of training crosses several at once. She gets
    // the one she has, not five screens in a row.
    const far = RANKS[6];
    const earned = newRankFor(atScore(far.at), RANKS[0].at);
    expect(earned?.name).toBe(far.name);
  });

  it("only ever goes forward", () => {
    // Every input is a lifetime total so the score cannot fall — but if that
    // ever changes, a bad fortnight must not produce a celebration screen for
    // a rank she is dropping *into*.
    expect(newRankFor(atScore(RANKS[1].at), RANKS[5].at)).toBeNull();
  });

  it("holds at the top rather than repeating", () => {
    const top = RANKS[RANKS.length - 1];
    expect(newRankFor(atScore(top.at + 50_000), top.at)).toBeNull();
    expect(rankNumber(top)).toBe(RANKS.length);
  });

  it("counts a session and a streak, not just sets", () => {
    // Turning up is the thing being rewarded; sets are only the loudest input.
    expect(scoreFor({ ...nothing, sessions: 1 })).toBe(8);
    expect(scoreFor({ ...nothing, streakWeeks: 1 })).toBe(15);
    expect(scoreFor({ ...nothing, milestones: 1 })).toBe(25);
  });
});

suite("two celebrations, one screen", () => {
  const css = fs.readFileSync("app/globals.css", "utf8");
  const title = fs.readFileSync("components/title-earned.tsx", "utf8");
  const done = fs.readFileSync("components/session-done.tsx", "utf8");

  it("lets the session summary go first", () => {
    // Finishing a session is usually what pushed her over the rank, so both
    // want the screen at once. Stacked, she reads neither.
    expect(done).toMatch(/data-celebration="session"/);
    expect(title).toMatch(/data-celebration="title"/);
    expect(css).toMatch(/body:has\(\[data-celebration="session"\]\) \[data-celebration="title"\]/);
    expect(css).toMatch(/display: none !important/);
  });

  it("queues in CSS, so the tap that clears one cannot clear both", () => {
    // A hidden element takes no pointer events. Polling for the other screen
    // from an effect would mean setting state inside one, which the React
    // compiler refuses — and it was right to.
    expect(title).not.toMatch(/setInterval|querySelector/);
  });

  it("waits a beat before it will take a tap", () => {
    // Otherwise the tap that finished her last set also clears the thing that
    // set just earned her.
    expect(title).toMatch(/setTimeout\(/);
    expect(title).toMatch(/600/);
  });
});

suite("nobody is handed a rank they already had", () => {
  it("ships a backfill for accounts that predate the screen", () => {
    // Null means "never shown". Without stamping, every existing account gets
    // a celebration for a title it has held for months, which is the fastest
    // way to teach people the screen means nothing.
    const script = fs.readFileSync("scripts/backfill-title-seen.ts", "utf8");
    expect(script).toMatch(/isNull\(profiles\.titleSeenAt\)/);
    // And onboarding stamps it for everyone after them.
    expect(fs.readFileSync("lib/tools/profile.ts", "utf8")).toMatch(/patch\.titleSeenAt = RANKS\[0\]\.at/);
  });
});
