import { describe as suite, expect, it } from "vitest";
import { clockDuration, elapsedMs, readableDuration } from "@/lib/session-clock";
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
    expect(card).toMatch(/aria-label="Finish workout"/);
    expect(card).toMatch(/elapsedMs\(startedAt, now, finishedAt, \{ since: pausedAt, alreadyMs: pausedMs \}\)/);
    // The clock can be corrected — it gets left running overnight, or paused
    // at the door and never restarted. What must not be a stray tap away is
    // *ending* the session, which is the button beside it.
    expect(card).toMatch(/title="Tap to correct the session time"/);
    expect(card).toMatch(/action\("set_session_time", \{ minutes \}\)/);
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
    expect(card).toMatch(/setFinishedMs\(elapsedMs\(view\.startedAt, Date\.now\(\), view\.finishedAt,/);
    expect(card).toMatch(/durationMs=\{finishedMs\}/);
    const done = read("components/session-done.tsx");
    expect(done).toMatch(/label="on your feet"/);
    // The line is seeded the same way, but chosen in the register she picked
    // — see lib/voice.ts.
    expect(done).toMatch(/\{line\("sessionDone", tone, seed\)\}/);
  });

  it("the clock comes off the workout row, so it survives a reload", () => {
    const views = read("lib/views.ts");
    expect(views).toMatch(/startedAt: workout\?\.startedAt\?\.toISOString\(\) \?\? null/);
    expect(views).toMatch(/finishedAt: workout\?\.completedAt\?\.toISOString\(\) \?\? null/);
  });
});

suite("pausing a session", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");
  const t = (iso: string) => Date.parse(iso);

  it("stops the clock where it was, rather than behind a stopped button", () => {
    const started = "2026-09-09T18:00:00.000Z";
    const paused = "2026-09-09T18:30:00.000Z";
    // Half an hour in, paused, and an hour of wall clock later it still
    // reads half an hour.
    expect(elapsedMs(started, t("2026-09-09T19:30:00.000Z"), null,
      { since: paused, alreadyMs: 0 })).toBe(30 * 60_000);
  });

  it("takes earlier pauses off once it is running again", () => {
    // A session left running through a two-hour dinner otherwise reports two
    // hours of training, and "you trained for 2h today" has to be true.
    const started = "2026-09-09T18:00:00.000Z";
    expect(elapsedMs(started, t("2026-09-09T20:00:00.000Z"), null,
      { since: null, alreadyMs: 60 * 60_000 })).toBe(60 * 60_000);
  });

  it("banks every pause, not just the last one", () => {
    // Recomputing from the current pause forgets the earlier ones and reports
    // a longer session than she did.
    const tools = read("lib/tools/training.ts");
    const fn = tools.slice(tools.indexOf("export const resumeWorkout"));
    expect(fn.slice(0, 1500)).toMatch(/pausedMs: w\.pausedMs \+ held/);
  });

  it("never reads negative, whatever the clocks say", () => {
    expect(elapsedMs("2026-09-09T18:00:00.000Z", t("2026-09-09T17:00:00.000Z"))).toBe(0);
    expect(elapsedMs("2026-09-09T18:00:00.000Z", t("2026-09-09T18:10:00.000Z"), null,
      { since: null, alreadyMs: 99 * 60_000 })).toBe(0);
  });

  it("is a glyph beside Finish, and both tools are registered", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/aria-label=\{paused \? "Start the clock again" : "Pause the session"\}/);
    expect(card).toMatch(/action\(view\.pausedAt \? "resume_workout" : "pause_workout"/);
    const index = read("lib/tools/index.ts");
    expect(index).toMatch(/training\.pauseWorkout/);
    expect(index).toMatch(/training\.resumeWorkout/);
  });

  it("the finished row fits a phone — 2026-09-18, \"Finished resume and today looks bad on mobile\"", () => {
    // The chip plus the Resume pill was ~290px on a row with ~320px, shared
    // with the day's arrows: it wrapped under them and the day's name fell to
    // a third line. On a phone the finished state is a reading — a tick and
    // the length — beside the one control, the width of the running row.
    const src = read("components/train-client.tsx");
    const finished = src.slice(src.indexOf("if (finishedAt) {"), src.indexOf("One control, in the slot Start was in."));
    // The chip's furniture — border, fill, padding — only from sm up.
    expect(finished).toMatch(/sm:rounded-full sm:border sm:border-beat\/40 sm:bg-beat-soft sm:px-3\.5 sm:py-1\.5/);
    expect(finished).not.toMatch(/className="[^"]*(?<!sm:)\brounded-full border border-beat/);
    // The word goes on a phone; the tick stands in for it, and a screen
    // reader still gets the sentence.
    expect(finished).toMatch(/<span className="hidden sm:inline">Finished —/);
    expect(finished).toMatch(/<svg className="sm:hidden"/);
    expect(finished).toMatch(/aria-label=\{`Finished — \$\{readableDuration\(ms\)\}`\}/);
    // And Resume stays the short word on a phone.
    expect(finished).toMatch(/<span className="sm:hidden">Resume<\/span>/);
  });

  it("does not tick while it is stopped", () => {
    // Nothing to tick: the reading cannot change.
    expect(read("components/train-client.tsx")).toMatch(/if \(finishedAt \|\| pausedAt\) return;/);
  });
});

suite("only the Finish button says it is finishing", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("pausing and starting have their own flag", () => {
    // They shared `finishing`, so tapping pause turned the button beside it
    // into "Finishing…" for a second — the app announcing it was about to do
    // the one thing she had not asked for.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/const \[pausing, setPausing\] = useState\(false\)/);
    expect(card).toMatch(/clockBusy=\{pausing\}/);
    expect(card).toMatch(/\{clockBusy \? "Starting…" : \(/);
    // The word shrinks to "Start" on a phone; the full phrase stays in the
    // label, so what a screen reader is told does not shrink with it.
    expect(card).toMatch(/aria-label="Start workout"/);
    // The pause glyph is disabled by the clock's flag, not the finish one.
    const bar = card.slice(card.indexOf("One control, in the slot Start was in"));
    expect(bar.slice(0, 1400)).toMatch(/onClick=\{onPause\}\n\s*disabled=\{clockBusy\}/);
    // And "Finishing…" still belongs to finishing. The window is the running
    // branch, widened when Finish grew a filled state for a finished plan.
    expect(bar.slice(0, 3200)).toMatch(/\{busy \? "Finishing…" : "Finish"\}/);
  });
});

suite("the clock is on every day she could still be working on", () => {
  const card = fs.readFileSync("components/train-client.tsx", "utf8");

  it("is not locked to today", () => {
    /*
      It was, and that is wrong in both directions: a session that runs past
      midnight lands on yesterday and could not be finished, and a Saturday
      session logged on Sunday morning could not be started or timed at all.
      What decides is whether the day is *done* — a finished session has
      nothing left to start, pause or finish.
    */
    expect(card).toMatch(/const sessionBar = !isFutureDay \?/);
    expect(card).not.toMatch(/const sessionBar = isToday \?/);
    // A finished day keeps its bar too — it carries how long the session ran,
    // and the way to pick it back up.
    expect(card).toMatch(/onReopen=\{reopen\}/);
  });

  it("is still absent on a day that has not happened", () => {
    // The tools refuse a future date anyway; the control would only be there
    // to be turned down.
    // Against the day she is *training* on since 2026-09-19, which past
    // midnight is not the day it is — see tests/training-day.test.ts.
    expect(fs.readFileSync("app/train/page.tsx", "utf8")).toMatch(/isFutureDay=\{on > day\}/);
    expect(fs.readFileSync("app/train/[slug]/page.tsx", "utf8")).toMatch(/isFutureDay=\{on > day\}/);
  });

  it("finishes the day on screen, not today's", () => {
    /*
      The one that would have gone wrong silently. Start and pause have always
      carried the date; finish did not, so signing off yesterday would have
      closed today's session instead — which is the reason the control was
      locked to today rather than a reason to keep locking it.
    */
    const fn = card.slice(card.indexOf("async function finish("), card.indexOf("async function finish(") + 2000);
    expect(fn).toMatch(/\.\.\.\(date === undefined \? \{\} : \{ date \}\)/);
  });

  it("leaves the rest provider on today alone", () => {
    // It is global and drives the GO screen. Somebody filling in yesterday on
    // Sunday morning does not want a countdown, and seeding from the day she
    // is reading would replace the session she is actually in.
    const seed = card.slice(card.indexOf("This seeds the rest provider"));
    expect(seed.slice(0, 600)).toMatch(/if \(!isToday\) return;/);
  });
});
