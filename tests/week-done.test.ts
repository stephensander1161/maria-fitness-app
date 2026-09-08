import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { dayIsDone, sessionHappened, splitWeek, type PlannedDay, type Session } from "@/lib/week-done";
import { visibleHeight, SHEET_MAX } from "@/lib/viewport-cover";

const read = (p: string) => fs.readFileSync(p, "utf8");

const day = (dayOfWeek: number, title: string, id = `d${dayOfWeek}`): PlannedDay =>
  ({ id, dayOfWeek, title });
const session = (p: Partial<Session>): Session =>
  ({ planDayId: null, title: "Freestyle session", dayOfWeek: 0, sets: 0, completed: false, ...p });

suite("a planned session counts as done when the work is done", () => {
  it("does not need the Finish workout button", () => {
    // Her Monday: twenty sets logged, Finish never pressed, and Progress said
    // she had missed the session she had just finished.
    const mon = day(0, "Biceps and Triceps");
    expect(dayIsDone(mon, [session({ dayOfWeek: 0, sets: 20 })])).toBe(true);
  });

  it("counts a session filed on the day even when it is bound to nothing", () => {
    // The row was created before the programme rolled forward into the week,
    // so planDayId was null and the title was the placeholder.
    const mon = day(0, "Biceps and Triceps");
    const orphan = session({ dayOfWeek: 0, sets: 20, title: "Freestyle session", planDayId: null });
    expect(dayIsDone(mon, [orphan])).toBe(true);
    // And it does not tick off the rest of the week with it.
    expect(dayIsDone(day(1, "Shoulders"), [orphan])).toBe(false);
    expect(dayIsDone(day(5, "Legs"), [orphan])).toBe(false);
  });

  it("still honours the binding when there is one", () => {
    const wed = day(2, "Core", "the-id");
    // Logged on the wrong date, but bound to Wednesday: it is Wednesday's.
    expect(dayIsDone(wed, [session({ planDayId: "the-id", dayOfWeek: 4, sets: 3 })])).toBe(true);
  });

  it("does not count an empty session that was only opened", () => {
    // Start workout creates the row. Tapping it and walking out is not a
    // session, and counting it would tick off a day she never trained.
    expect(sessionHappened(session({ sets: 0, completed: false }))).toBe(false);
    expect(dayIsDone(day(0, "Legs"), [session({ dayOfWeek: 0, sets: 0 })])).toBe(false);
    // Finished with nothing logged is still a session she says she did.
    expect(sessionHappened(session({ sets: 0, completed: true }))).toBe(true);
  });

  it("a bound session on another day does not tick this one", () => {
    expect(dayIsDone(day(0, "Legs", "mon"), [session({ planDayId: "tue", dayOfWeek: 1, sets: 5 })]))
      .toBe(false);
  });
});

suite("the week splits into done, missed and still to come", () => {
  const week = [day(0, "Biceps and Triceps"), day(1, "Shoulders"), day(3, "Chest"), day(5, "Legs")];

  it("today is remaining, not missed", () => {
    // Tuesday. Monday is done, Tuesday is hers to do, nothing is missed.
    const out = splitWeek(week, [session({ dayOfWeek: 0, sets: 20 })], 1);
    expect(out.doneDays).toEqual(["Biceps and Triceps"]);
    expect(out.missedDays).toEqual([]);
    expect(out.remainingDays).toEqual(["Shoulders", "Chest", "Legs"]);
  });

  it("names what was actually skipped once the day has passed", () => {
    const out = splitWeek(week, [session({ dayOfWeek: 0, sets: 20 })], 3);
    expect(out.missedDays).toEqual(["Shoulders"]);
    expect(out.remainingDays).toEqual(["Chest", "Legs"]);
  });

  it("a finished week has nothing remaining", () => {
    const out = splitWeek(week, [], 7);
    expect(out.remainingDays).toEqual([]);
    expect(out.missedDays).toHaveLength(4);
  });
});

suite("the week review reads the work, not the button", () => {
  it("no longer filters sessions on completedAt", () => {
    const src = read("lib/progress.ts");
    const fn = src.slice(src.indexOf("export async function weekReview"), src.indexOf("// Compare each exercise"));
    expect(fn).not.toMatch(/completedAt\} is not null/);
    expect(fn).toMatch(/splitWeek\(/);
  });
});

suite("a session started before the plan arrived adopts it", () => {
  it("re-binds an unbound row and drops the placeholder title", () => {
    const src = read("lib/tools/training.ts");
    const fn = src.slice(src.indexOf("export async function ensureWorkout"), src.indexOf("export const startWorkout"));
    expect(fn).toMatch(/\n {6}if \(open\.planDayId === null && planDay\) \{\n/);
    expect(fn).toMatch(/planDayId: planDay\.id/);
    // Only the placeholder. A title she chose herself is hers.
    expect(fn).toMatch(/open\.title === FREESTYLE \? \{ title: planDay\.title \} : \{\}/);
  });
});

suite("a sheet is as tall as the screen actually is", () => {
  it("reports the visible height, and refuses to guess while zoomed", () => {
    expect(visibleHeight({ height: 660, scale: 1 })).toBe(660);
    // Pinched in to read something: nothing should resize under her.
    expect(visibleHeight({ height: 400, scale: 2.5 })).toBeNull();
    expect(visibleHeight({ height: 0, scale: 1 })).toBeNull();
    expect(visibleHeight({ height: Number.NaN, scale: 1 })).toBeNull();
  });

  it("falls back to dvh where there is no visual viewport", () => {
    // The browsers without the API are the ones that get dvh right.
    expect(SHEET_MAX).toContain("86dvh");
    expect(SHEET_MAX).toContain("var(--visual-height, 86dvh)");
  });

  it("is published by the component that watches the viewport", () => {
    const src = read("components/viewport-cover.tsx");
    expect(src).toMatch(/setProperty\("--visual-height"/);
    // Written only when it changes, or every toolbar scroll is a repaint.
    expect(src).toMatch(/tall !== lastTall/);
  });

  it("and the set sheet uses it rather than dvh", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/\.\.\.\(open \? \{ maxHeight: SHEET_MAX \} : \{\}\)/);
    expect(card).not.toMatch(/max-h-\[86dvh\]/);
  });
});

suite("the set sheet is the set, not the library entry", () => {
  it("folds the cues away behind a tap", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/const \[showCues, setShowCues\] = useState\(false\)/);
    expect(card).toMatch(/\{open && showCues && <FullCues exercise=\{exercise\} \/>\}/);
    // The one-line cue and the drawing stay, at all times — the merge she asked
    // for. Only the wall of text folds.
    expect(card).toMatch(/<CyclingCue cues=\{exercise\.formCues\} \/>/);
    // Nothing to fold means no control offered.
    expect(card).toMatch(/const hasDetail =/);
  });
});

suite("the plan header says which week is on screen", () => {
  it("names the week it is showing, not today's", () => {
    const page = read("app/plan/page.tsx");
    expect(page).toMatch(/shownWeek === thisWeek \? prettyDate\(her\) : `Week of \$\{prettyDate\(shownWeek\)\}`/);
    expect(page).not.toMatch(/Week of \{prettyDate\(weekStart\(her\)\)\}/);
    expect(page).toMatch(/weeksApart === 1 \? "Next week"/);
  });
});
