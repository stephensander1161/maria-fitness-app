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
  const fn = () => {
    const src = read("lib/progress.ts");
    return src.slice(src.indexOf("export async function weekReview"), src.indexOf("// Compare each exercise"));
  };

  it("no longer filters sessions on completedAt", () => {
    expect(fn()).not.toMatch(/completedAt\} is not null/);
    expect(fn()).toMatch(/splitWeek\(/);
  });

  it("counts the sets with a join, not a correlated subquery", () => {
    // The subquery version returned 0 for a session holding twenty sets, so
    // the fix above reported the day as missed exactly as before. Verified
    // against the real row this came from, not just read.
    expect(fn()).toMatch(/\.groupBy\(setLogs\.workoutId\)/);
    expect(fn()).not.toMatch(/select count\(\*\)::int from \$\{setLogs\}/);
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
  it("opens the entry on the movement's own screen, and folds it on a card", () => {
    const card = read("components/train-client.tsx");
    // On a page about one movement, a fold was one more tap between arriving
    // and reading how to do it. In the day's list it still folds: six of them
    // open at once is the whole library.
    expect(card).toMatch(/const \[showCues, setShowCues\] = useState\(asPage\)/);
    expect(card).toMatch(/\{open && showCues && <FullCues exercise=\{exercise\} \/>\}/);
    // The cycling one-liner is for the closed cards only — above the full
    // entry it is the same words twice.
    expect(card).toMatch(/\{!open && <CyclingCue cues=\{exercise\.formCues\} \/>\}/);
    // Nothing to fold means no control offered.
    expect(card).toMatch(/const hasDetail =/);
  });
});

suite("the plan header says which week is on screen", () => {
  it("puts the date on every day chip, so the strip changes with the week", () => {
    // The chips carried a count of exercises and nothing else, and an
    // untouched week inherits the last one — so five weeks ahead read
    // "5 5 4 4 5 5 Rest" exactly like the week she was standing in, and the
    // only thing that moved was a line of small print above them.
    const plan = read("components/plan-client.tsx");
    expect(plan).toMatch(/date: Number\(addDays\(shownWeek, d\.dayOfWeek\)\.slice\(8, 10\)\)/);
    expect(plan).toMatch(/\{d\.dayName\.slice\(0, 3\)\} \{d\.date\}/);
    expect(plan).toMatch(/aria-label=\{`\$\{d\.dayName\} the \$\{d\.date\}/);
  });

  it("names the week it is showing, not today's", () => {
    const page = read("app/plan/page.tsx");
    expect(page).toMatch(/shownWeek === thisWeek \? prettyDate\(her\) : `Week of \$\{prettyDate\(shownWeek\)\}`/);
    expect(page).not.toMatch(/Week of \{prettyDate\(weekStart\(her\)\)\}/);
    expect(page).toMatch(/weeksApart === 1 \? "Next week"/);
  });
});

suite("a movement is a page on a phone, a sheet on a desktop", () => {
  const card = () => read("components/train-client.tsx");

  it("has a route of its own, per movement and per day", () => {
    const route = read("app/train/[slug]/page.tsx");
    expect(route).toMatch(/params: Promise<\{ slug: string \}>/);
    // The day travels with it, or the page writes to the wrong one.
    expect(route).toMatch(/searchParams: Promise<\{ d\?: string \}>/);
    expect(route).toMatch(/focus=\{slug\}/);
    // One line at the top, not three: a page title, a day title and a back
    // link is what put the Log button under the tab bar.
    expect(route).not.toMatch(/<header/);
  });

  it("the way in is a real link, so it works before any of this runs", () => {
    expect(card()).toMatch(/const pageFor = \(slug: string\) => `\/train\/\$\{slug\}\$\{date \? `\?d=\$\{date\}` : ""\}`/);
    expect(card()).toMatch(/href=\{pageFor\(ex\.slug\)\}/);
    // TapIn renders a Link when there is somewhere to go, a button otherwise.
    expect(card()).toMatch(/<Link href=\{href\} onClick=\{onClick\}/);
  });

  it("a wide screen still lifts the card, and the query is read on the tap", () => {
    // Reading a media query during render is a hydration mismatch — the
    // server has no idea how wide the screen is.
    expect(card()).toMatch(/function onAPhone\(\): boolean \{/);
    expect(card()).toMatch(/if \(href && onAPhone\(\)\) return;/);
    expect(card()).toMatch(/const PHONE = "\(max-width: 767px\)"/);
  });

  it("on its own page there is no dialog at all", () => {
    // No scrim to land a tap on, no focus trap, no pinned body — every one
    // of which was between her and typing a number.
    expect(card()).toMatch(/if \(asPage\) return card;/);
    const bare = card().indexOf("if (asPage) return card;");
    expect(bare).toBeLessThan(card().indexOf("<CardModal"));
    expect(card()).toMatch(/const open = asPage \|\| lifted;/);
  });

  it("carries the movement either side, by name", () => {
    // "Next" on its own makes her tap it to find out what it is.
    expect(card()).toMatch(/aria-label="The rest of the day"/);
    expect(card()).toMatch(/href=\{pageFor\(before\.slug\)\}/);
    expect(card()).toMatch(/href=\{pageFor\(after\.slug\)\}/);
    expect(card()).toMatch(/\{before\.name\}/);
    expect(card()).toMatch(/\{after\.name\}/);
  });

  it("and says so when the movement is not on that day", () => {
    // An empty state is not `return null`.
    expect(card()).toMatch(/That movement is not on this day/);
  });
});

suite("the day's name and its clock share a container", () => {
  it("does the same on Train, where it was three stacked blocks", () => {
    // A heading centred under the date arrows, then a Start button on a line
    // of its own beneath it — on a phone that was most of what sat above the
    // first movement.
    const page = read("app/train/page.tsx");
    expect(page).toMatch(/heading=\{/);
    expect(page).toMatch(/<DayTitle title=\{view\.title\} dayOfWeek=\{dayIndex\(on\)\} focus=\{view\.focus\} compact \/>/);
    // And DayNav no longer carries the title as well.
    expect(page).not.toMatch(/<\/DayNav>/);
  });

  it("hands the heading to the session, on today", () => {
    // Start workout was a button on a line of its own directly under a card
    // saying "Today · Tuesday / Shoulders" — two containers saying one thing,
    // and a whole row of a phone between the session's name and the session.
    const plan = read("components/plan-client.tsx");
    expect(plan).toMatch(/heading=\{<DayHeader day=\{day\} trainingDay=\{trainingDay\} exists=\{week\.exists\} isToday \/>\}/);
    // One heading, used by both branches, rather than two that drift.
    expect(plan).toMatch(/function DayHeader\(\{/);
  });

  it("floats the control right, on one row in both states", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/<div className="min-w-0 flex-1 basis-32">\{heading\}<\/div>/);
    expect(card).toMatch(/<div className="ml-auto shrink-0">\{sessionBar\}<\/div>/);
    expect(card).toMatch(/flex flex-wrap items-start justify-between gap-x-3 gap-y-2/);
  });

  it("shortens the running label rather than wrapping or clipping", () => {
    // A timer and "Finish workout" came to about 270px of a 361px row, so
    // either the session name was squeezed to "Tues…" or the controls dropped
    // onto a second line with a lake of empty card beside them. The timer
    // already says what is running; the button only says how to stop it.
    const bar = read("components/train-client.tsx");
    expect(bar).toMatch(/\{busy \? "Finishing…" : "Finish"\}/);
    // The full phrase still reaches a screen reader.
    expect(bar).toMatch(/aria-label="Finish workout"/);
  });

  it("and the title can actually shrink, which is why it overlapped", () => {
    // A flex item will not shrink below its content by default, so `truncate`
    // on the heading inside did nothing and a long session name ran out of
    // its column and under the button beside it.
    const title = read("components/day-title.tsx");
    expect(title).toMatch(/className="group flex min-w-0 max-w-full items-baseline gap-2 text-left"/);
    expect(title).toMatch(/compact \? "text-\[17px\]" : "text-2xl"/);
  });
});
