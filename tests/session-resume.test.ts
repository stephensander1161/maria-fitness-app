import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const src = fs.readFileSync("lib/tools/training.ts", "utf8");
const card = fs.readFileSync("components/train-client.tsx", "utf8");

suite("a paused clock restarts when she does", () => {
  it("resumes in ensureWorkout, so every path that records work counts", () => {
    // Pausing is a real thing to do; the way it ends is almost never the pause
    // button a second time. It ends with another set — which is the app being
    // told the session is under way by the only evidence that matters.
    const fn = src.slice(src.indexOf("export async function ensureWorkout"));
    expect(fn.slice(0, 2500)).toMatch(/if \(open\.pausedAt && !open\.completedAt\)/);
    // Banked, not discarded: earlier pauses stay in the ledger.
    expect(fn.slice(0, 2500)).toMatch(/pausedMs: open\.pausedMs \+ held/);
    // Not in log_set — the card, the offline outbox and the coach all come
    // through here, and only one of them is log_set.
    expect(fn.slice(0, 2500)).toMatch(/every path that records work goes/);
  });

  it("and the length can be corrected when it was left running", () => {
    expect(src).toMatch(/name: "set_session_time"/);
    // Set, not adjusted: elapsed is now − startedAt − pausedMs, so moving the
    // start and clearing the ledger is the only version either of us can
    // explain afterwards.
    expect(src).toMatch(/const startedAt = new Date\(Date\.now\(\) - input\.minutes \* 60_000\)/);
    expect(src).toMatch(/\.set\(\{ startedAt, pausedAt: null, pausedMs: 0 \}\)/);
    expect(src).toMatch(/minutes: z\.number\(\)\.int\(\)\.min\(0\)\.max\(600\)/);
  });

  it("the clock is the control, and Finish still is not", () => {
    // The clock was deliberately not a tap target once, and the reasoning was
    // about ending a session by accident. That is the button beside it, and
    // it is still not a stray tap away.
    expect(card).toMatch(/title="Tap to correct the session time"/);
    expect(card).toMatch(/aria-label="Finish workout"/);
    expect(card).toMatch(/onFinish=\{\(\) => \(outstanding\.length > 0 \? setFinishEarly\(true\) : void finish\(\)\)\}/);
  });
});
