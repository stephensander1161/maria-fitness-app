import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { allowanceLeftPct, ALLOWANCE_WARN_PCT } from "@/lib/allowance-pct";
import { nextAfter } from "@/components/train-client";
import { isSingleColumn, moveItem, slotFor, slotForPoint } from "@/lib/reorder";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("the phone reaches the whole app", () => {
  it("builds the menu and the bottom row from one list", () => {
    // Two lists is how Friends and Admin reached the sidebar and nowhere on a
    // phone. One exported function, two consumers.
    expect(read("components/more-nav.tsx")).toMatch(/export function moreItems\(/);
    expect(read("components/mobile-menu.tsx")).toMatch(/moreItems\(isOwner, recovering\)/);
    expect(read("components/more-nav.tsx")).toMatch(/moreItems\(isOwner, recovering\)/);
  });

  it("carries the six main screens too, from the same list as the bottom bar", () => {
    // The bottom bar is position: fixed, and a phone browser's own toolbar
    // can sit on top of it — the owner could not reach Train or Plan at all.
    // The menu button is in normal flow, so every screen has to be in it.
    const menu = read("components/mobile-menu.tsx");
    expect(menu).toMatch(/import \{ TABS \} from "\.\/tab-bar"/);
    expect(menu).toMatch(/TABS\.map\(/);
    expect(menu).not.toMatch(/href="\/(train|plan|eat|progress|kitchen|learn)"/);
  });

  it("holds the page still while a dialog is open, and scrolls the panel instead", () => {
    // A thumb on the phone menu was scrolling the Train screen underneath.
    const hook = read("lib/use-dialog.ts");
    expect(hook).toMatch(/root\.style\.overflow = "hidden"/);
    // Put back exactly as it was, not blanked: a page that set its own
    // overflow would otherwise lose it after the first dialog.
    expect(hook).toMatch(/root\.style\.overflow = was\.overflow/);
    // Pinned at her offset and put back there, not sent to the top.
    expect(hook).toMatch(/body\.style\.top = `-\$\{y\}px`/);
    expect(hook).toMatch(/window\.scrollTo\(0, y\)/);
    // Giving focus back must not scroll to the button at the top either.
    expect(hook).toMatch(/opener\?\.focus\?\.\(\{ preventScroll: true \}\)/);
    const menu = read("components/mobile-menu.tsx");
    expect(menu).toMatch(/overscroll-contain/);
    expect(menu).toMatch(/max-h-\[85dvh\]/);
    expect(menu).toMatch(/items-start/);
    // The lock lives as long as the component that calls the hook. Called
    // from the always-mounted button, it held every page still from the
    // moment the greeting rendered — the hook belongs to the sheet.
    expect(menu.indexOf("useDialog(")).toBeGreaterThan(menu.indexOf("function MenuSheet"));
    expect(menu.slice(menu.indexOf("export function MobileMenu"), menu.indexOf("function MenuSheet"))).not.toMatch(/useDialog\(/);
  });

  it("puts the menu at the top, where it can be found without scrolling", () => {
    expect(read("components/mobile-greeting.tsx")).toMatch(/<MobileMenu /);
    // ...and it is a real dialog: trapped focus, Escape, focus restored.
    const menu = read("components/mobile-menu.tsx");
    expect(menu).toMatch(/useDialog\(/);
    expect(menu).toMatch(/aria-modal="true"/);
  });
});

suite("the allowance is not a cliff", () => {
  it("turns spend into a percentage left, bounded", () => {
    expect(allowanceLeftPct(0, 500_000)).toBe(100);
    expect(allowanceLeftPct(250_000, 500_000)).toBe(50);
    expect(allowanceLeftPct(500_000, 500_000)).toBe(0);
    expect(allowanceLeftPct(900_000, 500_000)).toBe(0);
    expect(allowanceLeftPct(100, 0)).toBe(0);
  });

  it("is sent as every turn ends, after that turn's usage is recorded", () => {
    const loop = read("lib/agent/loop.ts");
    const body = loop.slice(loop.indexOf("await recordUsage(message.usage"));
    expect(body.indexOf('type: "allowance"')).toBeGreaterThan(-1);
    expect(body.indexOf('type: "allowance"')).toBeLessThan(body.indexOf('type: "done"'));
  });

  it("is shown on both coach surfaces, near the composer", () => {
    for (const f of ["components/coach-bubble.tsx", "components/ask-coach.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/<AllowanceNote leftPct=\{allowance\} \/>/);
    }
    expect(ALLOWANCE_WARN_PCT).toBeLessThanOrEqual(30);
  });
});


suite("the training card during a session", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");
  const card = read("components/train-client.tsx");

  it("an empty set square logs a set, like the + does", () => {
    // It looked like a slot to fill from the first day and did nothing.
    expect(card).toMatch(/label=\{`Log set \$\{i \+ 1\} of \$\{exercise\.name\}`\}/);
    expect(card).toMatch(/if \(!s && canLog\)/);
    // A day she cannot log to must not offer it.
    expect(card.indexOf("if (!s && canLog)")).toBeLessThan(card.indexOf("if (!s || isQueued)"));
  });

  it("shows last time set by set where this set is being entered", () => {
    // The header line summarises "12, 12, 10" as "3×12", which loses exactly
    // the comparison she is making.
    expect(card).toMatch(/Last time \(\{exercise\.lastTime\.date\.slice\(5\)\}\)/);
    expect(card).toMatch(/\.join\(" · "\)/);
  });

  it("rests into the next movement when one is finished, and marks it", () => {
    // The rest used to be for the movement she had just finished — the GO
    // screen offered her a fifth set of something she had done four of.
    expect(card).toMatch(/const next = finishedExercise \? nextAfter\(view\.exercises, ex\.slug\) : null/);
    expect(card).toMatch(/else if \(next\) startRest\(next\)/);
    // Beating while the session runs; still, but still marked, before it.
    expect(card).toMatch(/upNext \? \(live \? "border-beat now-glow" : "border-beat now-still"\) : ""/);
  });
});

suite("which movement comes next", () => {
  it("skips finished movements and never returns the one just done", () => {
    // Pure, so the wrap-around is checked rather than assumed.
    const ex = (slug: string, target: number, logged: number) =>
      ({ slug, targetSets: target, loggedToday: Array.from({ length: logged }, () => ({})) });
    const list = [ex("a", 3, 3), ex("b", 3, 3), ex("c", 3, 0), ex("d", 3, 1)] as never[];
    expect(nextAfter(list, "b")?.slug).toBe("c");
    // Wraps: she may have worked down the list and come back.
    expect(nextAfter(list, "d")?.slug).toBe("c");
    // Nothing left but the one she just did.
    expect(nextAfter([ex("a", 3, 3), ex("b", 3, 2)] as never[], "b")?.slug).toBe(undefined);
    // A movement with no target is not "outstanding".
    expect(nextAfter([ex("a", 3, 3), ex("b", 0, 0)] as never[], "a")).toBeNull();
  });
});

suite("left in the tank is answered, not committed to", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("selects rather than logging on the spot, on both surfaces", () => {
    // Tapping a number used to send the set, so answering this was also
    // committing to the reps and weight above it, with no way back.
    for (const f of ["components/train-client.tsx", "components/go-screen.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/onClick=\{\(\) => setRir\(rir === n \? null : n\)\}/);
      expect(src, f).toMatch(/aria-pressed=\{rir === n\}/);
      // The button below is what sends it.
      expect(src, f).toMatch(/rir \?\? undefined/);
    }
  });

  it("and tapping the same number again clears it, because unknown is not zero", () => {
    for (const f of ["components/train-client.tsx", "components/go-screen.tsx"]) {
      expect(read(f), f).toMatch(/rir === n \? null : n/);
      expect(read(f), f).toMatch(/useState<number \| null>\(null\)/);
    }
  });
});

suite("no day is locked", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("a past day can be logged to like any other", () => {
    // Training past midnight puts the session she is *in* on "yesterday", so
    // the lock fell on exactly the person who most needed to type.
    const card = read("components/train-client.tsx");
    expect(card).not.toMatch(/lockBanner|setUnlocked|Locked so a stray/);
    expect(card).toMatch(/const editable = true;/);
    // And nothing is left computing whether a day is in the past.
    expect(card).not.toMatch(/todayOnDevice/);
  });
});

suite("the movement she is working on comes forward", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");
  const card = read("components/train-client.tsx");

  it("opens as a centred dialog rather than expanding in the grid", () => {
    // Expanding in place pushed every other card around it, and the grid
    // reflowed under her thumb mid-set.
    expect(card).toMatch(/function CardModal/);
    expect(card).toMatch(/grid place-items-center/);
    expect(card).toMatch(/bg-scrim\/70 p-3 backdrop-blur-sm/);
    expect(card).toMatch(/if \(!open\) return <div ref=\{shell\}>\{card\}<\/div>/);
  });

  it("behaves like the dialog it says it is", () => {
    // aria-modal without a focus trap tells a screen reader the page behind
    // is inert while she edits it blind.
    const modal = card.slice(card.indexOf("function CardModal"));
    expect(modal).toMatch(/useDialog\(onClose\)/);
    expect(modal).toMatch(/aria-modal="true"/);
    expect(modal).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
    // The panel is not a scroller — the card inside it is the only one, and
    // it contains its own overscroll so reaching the end of the cues does not
    // hand the gesture to the page pinned behind the scrim.
    expect(card).toMatch(/min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  });

  it("holds its place in the grid so nothing jumps", () => {
    expect(card).toMatch(/setCollapsedHeight\(shell\.current\?\.offsetHeight\)/);
    expect(card).toMatch(/style=\{\{ height: collapsedHeight \}\}/);
    // Every way into the *card* measures first. (The target editor has a
    // setOpen of its own, which is a different, smaller thing.)
    const cardOnly = card.slice(0, card.indexOf("function TargetEditor"));
    expect(cardOnly).not.toMatch(/onClick=\{\(\) => setOpen\(true\)\}/);
  });

  it("animates, and stops when she has asked for less motion", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/@keyframes card-lift-in/);
    expect(css).toMatch(/@keyframes card-scrim-in/);
    // Every animation this app adds has to have an off switch for someone
    // who has asked for less motion.
    for (const cls of ["card-scrim, .card-lift", "cue-fade"]) {
      const blocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1);
      expect(blocks.some((b) => b.includes(`.${cls}`)), cls).toBe(true);
    }
  });
});

suite("the setup cues are on the card", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("come from the library through the day view, not a second fetch", () => {
    expect(read("lib/views.ts")).toMatch(/formCues: exercises\.formCues/);
    expect(read("lib/views.ts")).toMatch(/formCues: i\.formCues \?\? \[\]/);
  });

  it("show one at a time and take turns, so all of them get read eventually", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/function CyclingCue/);
    expect(card).toMatch(/\(n \+ 1\) % cues\.length/);
    expect(card).toMatch(/\{!open && <CyclingCue cues=\{exercise\.formCues\} \/>\}/);
    // A movement with one cue does not need a timer running for ever.
    expect(card).toMatch(/if \(cues\.length < 2\) return;/);
    // And never a live region: it repaints on a timer, and announcing each
    // change would talk over everything else the way the countdown once did.
    const cue = card.slice(card.indexOf("function CyclingCue"), card.indexOf("const CUE_MS"));
    expect(cue).not.toMatch(/aria-live|role="status"/);
  });

  it("the lifted card gets out of the way once the set is in — the page does not", () => {
    // Lifted over the screen, a card that stays open hides the rest timer and
    // the movement that is next. On its own page there is nothing behind it
    // to reveal, and closing would throw her back to the list between sets.
    const card = read("components/train-client.tsx");
    const logSet = card.slice(card.indexOf("async function logSet"));
    expect(logSet.slice(0, logSet.indexOf("} catch"))).toMatch(/if \(!asPage\) setLifted\(false\)/);
  });

  it("says why a set was refused, rather than shrugging", () => {
    // "That didn't save" reads as a network blip and gets tapped again
    // forever. A date in the future or reps on a hold is a real answer.
    const card = read("components/train-client.tsx");
    const logSet = card.slice(card.indexOf("async function logSet"));
    expect(logSet.slice(0, logSet.indexOf("const step ="))).toMatch(/setError\(actionMessage\(e,/);
  });
});

suite("which movement am I on", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("is marked at all times, not only while a rest is running", () => {
    // The marker used to be "whatever the rest counts down to", so it existed
    // for the ninety seconds between sets and vanished the rest of the time —
    // which is exactly when she looks for it.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/const currentSlug =/);
    expect(card).toMatch(/\?\? view\.exercises\.find\(\(e\) => e\.targetSets > 0 && e\.loggedToday\.length < e\.targetSets\)\?\.slug/);
  });

  it("is green, ringed and breathing, because it is read at arm's length", () => {
    expect(read("components/train-client.tsx")).toMatch(/border-beat now-glow/);
    const css = read("app/globals.css");
    expect(css).toMatch(/@keyframes now-glow/);
    expect(css).toMatch(/var\(--color-beat\)/);
    // Still unmistakable for someone who asked for less motion — still, not gone.
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.now-glow \{\s*animation: none;/);
  });
});

suite("reordering the day by dragging", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("moves an item in either direction without an off-by-one", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(list, 1, 1)).toEqual(list);
    // Out of range is clamped, never a hole in the list.
    expect(moveItem(list, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(list, 0, -5)).toEqual(list);
    expect(moveItem(list, 9, 0)).toEqual(list);
  });

  it("puts the row under the finger, not one behind it", () => {
    const mids = [50, 150, 250];
    expect(slotFor(mids, 0)).toBe(0);
    expect(slotFor(mids, 60)).toBe(0);
    expect(slotFor(mids, 160)).toBe(1);
    expect(slotFor(mids, 999)).toBe(2);
  });

  it("uses pointer events, because HTML5 drag does not fire on touch at all", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/onDragStart\(e\.clientY, e\.clientX\)/);
    // …and a long press anywhere on the card, because eight pixels of grip
    // among four other round buttons is a handle most thumbs never hit.
    expect(card).toMatch(/window\.setTimeout\(\(\) => \{ onDragStart\(startY, startX\); \}, 400\)/);
    // …and never inside the open card, where a press that holds still for
    // 400ms is what scrolling a long sheet with one thumb looks like.
    expect(card).toMatch(/if \(!onDragStart \|\| dragging \|\| open\) return;/);
    expect(card).toMatch(/\{onDragStart && !open && \(/);
    expect(card).toMatch(/style=\{\{ touchAction: "none" \}\}/);
    expect(card).not.toMatch(/draggable=|onDragOver=/);
  });

  it("the card follows the finger and the others slide out of its way", () => {
    // Reordering the list on every pointer move meant the thing she was
    // holding never moved with her and everything else jumped around it: it
    // worked and felt broken.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/function shiftFor\(i: number\)/);
    expect(card).toMatch(/offsetY=\{drag\?\.slug === ex\.slug \? drag\.dy : shiftFor\(i\)\}/);
    // No easing on the one in her hand; easing on the ones getting out of it.
    expect(card).toMatch(/transition: dragging \? "none" :/);
    // The DOM order is left alone until she lets go, or the measurements
    // taken at the start stop being true half way through the gesture.
    const move = card.slice(card.indexOf("const move = (ev: PointerEvent)"), card.indexOf("const end = async"));
    expect(move).not.toMatch(/setDragOrder/);
    expect(move).toMatch(/setDrag\(\{ slug, dx, dy, from, to, height, column \}\)/);
  });

  it("writes the order once, on release", () => {
    // A write per pixel of movement is a hundred round trips for one drag.
    const card = read("components/train-client.tsx");
    const begin = card.slice(card.indexOf("function beginDrag"));
    expect(begin.slice(0, begin.indexOf("\n  }"))).toMatch(/const end = async/);
    expect(card).toMatch(/action\("reorder_day_exercises"/);
    // And not at all when nothing moved.
    expect(card).toMatch(/if \(order\.join\(\) === slugs\.join\(\)\) return;/);
  });

  it("the tool keeps every movement, in a stated order", () => {
    // A reorder that silently dropped one would be a delete wearing another
    // name — anything not named keeps its place at the end.
    const training = read("lib/tools/training.ts");
    expect(training).toMatch(/name: "reorder_day_exercises"/);
    expect(training).toMatch(/const rest = rows\.filter\(\(r\) => !named\.includes\(r\.slug\)\)/);
    expect(training).toMatch(/Not on \$\{DAY_NAMES\[found\.dow\]\}/);
  });
});

suite("the marker never sits on a finished movement", () => {
  it("falls past the rest when the rest is for one that is done", () => {
    // The rest starts between sets and the last set does not end it, so the
    // running rest can legitimately be *for* the movement just completed —
    // and the marker stayed on four-of-four while the next one waited.
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/const stillToDo = \(slug: string \| undefined\)/);
    expect(card).toMatch(/\(stillToDo\(runningRest\?\.slug\) \? runningRest\?\.slug : undefined\)/);
  });
});

suite("the open card shows the whole movement", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("takes the screen, and reads out the library entry rather than cycling", () => {
    const card = read("components/train-client.tsx");
    // One scroller, and the entry outside it. Two nested scrollers is how the
    // sheet ended up unscrollable on a phone; the Log button below a screenful
    // of cues is how it ended up unreachable when it did scroll.
    expect(card).toMatch(/open \? "flex flex-col" : ""/);
    // Height from the visual viewport, not dvh — see tests/week-done.ts.
    expect(card).toMatch(/maxHeight: SHEET_MAX/);
    expect(card).toMatch(/open \? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""/);
    expect(card).toMatch(/open && editingSet === null \? "shrink-0 border-t border-line bg-ink\/40 p-3" : "hidden"/);
    expect(card).not.toMatch(/card-scrim[^"]*overflow-y-auto/);
    expect(card).toMatch(/max-w-lg/);
    // Open, the entry is simply there. It was behind a fold, then open by
    // default behind a fold, which is a dropdown whose only state is open —
    // a control that does nothing but invite a tap that hides the thing.
    expect(card).toMatch(/\{open && <FullCues exercise=\{exercise\} \/>\}/);
    expect(card).not.toMatch(/showCues/);
    // And the cycling one-liner belongs to the closed cards only: above the
    // full entry it is the same words twice.
    expect(card).toMatch(/\{!open && <CyclingCue cues=\{exercise\.formCues\} \/>\}/);
  });

  it("without a second fetch — it is three columns of a row already read", () => {
    expect(read("lib/views.ts")).toMatch(/commonMistakes: exercises\.commonMistakes, safetyNote: exercises\.safetyNote/);
    const full = read("components/train-client.tsx");
    const fn = full.slice(full.indexOf("function FullCues"), full.indexOf("One setup cue at a time"));
    expect(fn).not.toMatch(/action\(|fetch\(/);
    expect(fn).toMatch(/safetyNote/);
    expect(fn).toMatch(/Commonly gets wrong/);
  });
});

suite("asking for help opens the card, rather than stacking on it", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("has no separate help button at all — the card is the help", () => {
    // Once the open card carried the whole library entry, a "?" that opened
    // the card was the same button as the "+" beside it. Two round buttons
    // doing one job, on a row where the movement's name was losing to them.
    //
    // The entry itself now folds inside the card rather than printing in
    // full — a screenful of reading between the name and the Log button on a
    // phone. What must not come back is a *second surface*: no round button
    // in the header row, and nothing that opens on top of the card.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/<FullCues exercise=\{exercise\} \/>/);
    // Nothing else opens on top of the entry: the target is edited in place.
    expect(card).toMatch(/function TargetInline\(/);
    // Inside the card's own flow, not a dialog of its own.
    expect(card.split("function FullCues")[0]).not.toMatch(/CardModal[^]{0,200}FullCues/);
    expect(card).not.toMatch(/aria-label=\{`(Show|Open) the (guide|help)/);
  });

  it("keeps the edits inside the open card, and out of the name's row", () => {
    // They were two round buttons in the header, beside a name that had
    // already wrapped, then a full-width fold under the cues — a lot of
    // button for something touched once a month, nowhere near the number it
    // changes. Now it is a pencil inside the target line itself.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/line-clamp-2/);
    // The target itself is the input: tap a figure, type, leave the field.
    expect(card).toMatch(/\{open && editable \? \(\n\s*<TargetInline/);
    expect(card).not.toMatch(/Change the target for/);
    expect(card).not.toMatch(/TargetEditor/);
  });

  it("and the card no longer opens a guide of its own", () => {
    const card = read("components/train-client.tsx");
    expect(card).not.toMatch(/FormGuide|guideOpen/);
  });
});

suite("the movement is on the card, moving", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("the figure lives on the card, not behind a button", () => {
    // It was in the help sheet, which meant it was seen once — on the day
    // someone went looking — and it is the fastest way to tell whether the
    // name on the card is the thing you are about to do.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/<ExerciseFigure\s+slug=\{exercise\.slug\}/);
    // Smaller open than it was: at h-24 beside a name that had already
    // wrapped to two lines, the header was a column of dead space.
    expect(card).toMatch(/open \? "h-16 w-14" : "h-11 w-9"/);
  });

  it("and it still cross-fades between the two poses", () => {
    const figure = read("components/exercise-figure.tsx");
    expect(figure).toMatch(/className="figure-start"/);
    expect(figure).toMatch(/className="figure-end"/);
    const css = read("app/globals.css");
    expect(css).toMatch(/@keyframes figure-in/);
    // Still, not gone, for anyone who asked for less motion.
    expect(css).toMatch(/\.figure-end\s+\{ animation: none; opacity: 1 !important; \}/);
  });
});

suite("what is left this week", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("is a different list from what was missed", () => {
    // After finishing Tuesday's session the screen said "still to do:
    // Monday" — a day that had been and gone — and said nothing at all about
    // the two sessions ahead of her.
    // The split moved into lib/week-done.ts, where it is tested against days
    // rather than against the source text that computes them.
    const wd = read("lib/week-done.ts");
    expect(wd).toMatch(/remainingDays: notDone\.filter\(\(d\) => d\.dayOfWeek >= todayIndex\)/);
    expect(wd).toMatch(/missedDays: notDone\.filter\(\(d\) => d\.dayOfWeek < todayIndex\)/);
    expect(read("lib/progress.ts")).toMatch(/splitWeek\(/);
  });

  it("leads with it on the screen, and says so when there is nothing left", () => {
    const page = read("app/progress/page.tsx");
    expect(page).toMatch(/Left this week:/);
    expect(page).toMatch(/Missed so far/);
    expect(page).toMatch(/Every session this week, done\./);
    expect(page.indexOf("Left this week:")).toBeLessThan(page.indexOf("Missed so far"));
  });

  it("and the coach is told which list is which", () => {
    expect(read("lib/page-context.ts")).toMatch(/Left to do this week/);
    expect(read("lib/tools/training.ts")).toMatch(/remainingDaysMeans/);
  });
});

suite("the marker beats only while the session is running", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("is still until she has started", () => {
    // The beat is a rest counting down. Before the clock is running there is
    // no rest and nothing is happening, so a card pulsing at her while she
    // reads the day is urgency about a workout that has not begun.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/live=\{view\.startedAt !== null\}/);
    expect(card).toMatch(/upNext \? \(live \? "border-beat now-glow" : "border-beat now-still"\) : ""/);
    // And no animation timing on a thing that is not animating.
    expect(card).toMatch(/\.\.\.\(upNext && live \? \{ animationDuration: `\$\{beat\}s` \} : \{\}\)/);
  });

  it("but still says which movement she is on", () => {
    // Still is not absent: the question it answers is "which one am I doing".
    const css = read("app/globals.css");
    expect(css).toMatch(/\.now-still \{/);
    const still = css.slice(css.indexOf(".now-still {"), css.indexOf("}", css.indexOf(".now-still {")));
    expect(still).toMatch(/box-shadow/);
    expect(still).toMatch(/border-color: var\(--color-beat\)/);
    expect(still).not.toMatch(/animation/);
  });
});

suite("reordering works in a grid too, not only in a column", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("picks the nearest card in both axes", () => {
    // On a wide screen the day is a grid, two or three cards abreast, and a
    // vertical-only rule is meaningless there: half the cards share a `y`, so
    // dragging sideways moved nothing and dragging down jumped whole rows.
    // That is why it worked on a phone and did nothing on a desktop.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/to = column \? slotFor\(mids, ev\.clientY\) : slotForPoint\(centres, ev\.clientX, ev\.clientY\)/);
    expect(card).toMatch(/const column = isSingleColumn\(rects\.map\(\(r\) => r\.top\)\)/);
  });

  it("measures the shape rather than guessing it from a breakpoint", () => {
    // The same list is a column on a phone, a grid on a laptop and a wider
    // grid on a monitor.
    expect(isSingleColumn([0, 200, 400])).toBe(true);
    expect(isSingleColumn([0, 0, 200])).toBe(false);
    expect(isSingleColumn([100])).toBe(true);
    // Nearest centre, in two dimensions.
    const grid = [{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 50, y: 250 }, { x: 250, y: 250 }];
    expect(slotForPoint(grid, 240, 60)).toBe(1);
    expect(slotForPoint(grid, 60, 240)).toBe(2);
    expect(slotForPoint(grid, 245, 245)).toBe(3);
  });

  it("and shows where it will land, since nothing slides aside in a grid", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/if \(!drag \|\| !drag\.column \|\| i === drag\.from\) return 0;/);
    expect(card).toMatch(/dropTarget=\{drag !== null && !drag\.column && drag\.to === i && drag\.from !== i\}/);
    expect(card).toMatch(/dropTarget \? "border-accent ring-2 ring-accent\/40" : ""/);
  });
});

suite("the next set starts from the last one", () => {
  const card = () => fs.readFileSync("components/train-client.tsx", "utf8");

  it("re-seeds as each set lands, rather than reading the seed once", () => {
    // `useState(seedWeight)` reads it on mount, so the second set of the
    // evening opened on whatever the *first* was seeded from rather than on
    // the weight she had just used.
    expect(card()).toMatch(/const entryKey = `\$\{done\.length\}:\$\{queued\.length\}`/);
    expect(card()).toMatch(/const fresh = entry\.for !== entryKey/);
    expect(card()).toMatch(/const weight = fresh \? seedWeight : entry\.weight/);
    // The last set she actually did comes first in the seed.
    expect(card()).toMatch(/queued\.at\(-1\)\?\.weight \?\? done\.at\(-1\)\?\.weight \?\?/);
  });

  it("keeps what she has typed for the set she is on", () => {
    // Keyed, not an effect: re-seeding on every render would fight her thumb.
    expect(card()).toMatch(/setEntry\(\{ for: entryKey, weight: w, reps \}\)/);
    expect(card()).not.toMatch(/useEffect\(\(\) => \{[^}]*setWeight\(/);
  });
});

suite("relabel and remove are on the card", () => {
  const card = () => fs.readFileSync("components/train-client.tsx", "utf8");

  it("not only inside the one she is about to perform", () => {
    // They were in the header, then behind an Edit fold inside the open card
    // only — so the two things she does to a movement she is *not* doing were
    // reachable only by opening the one she is.
    expect(card()).toMatch(/\{editable && !asPage && \(\n\s*<button\n\s*onClick=\{\(\) => \{ setChanging\(!changing\)/);
    expect(card()).toMatch(/\{editable && !asPage && \(!exercise\.extra \|\| setCount > 0\) && \(/);
  });

  it("and a swap keeps the sets she already logged", () => {
    // change_exercise relabels the movement and brings its sets with it —
    // substitute_exercise is the other case, where the earlier sets really
    // were the old movement.
    const changer = card().slice(card().indexOf("function ChangeMovement"));
    expect(changer.slice(0, 3000)).toMatch(/action\("change_exercise"/);
    const tool = fs.readFileSync("lib/tools/swaps.ts", "utf8");
    expect(tool).toMatch(/bringing every set she already logged against it along/);
  });
});

suite("a dialog is set up once, for its whole life", () => {
  it("does not tear down and re-arm on every render", () => {
    // Every caller passes an inline arrow for onClose, so an effect keyed on
    // it re-ran on every render: cleanup handed focus back to the opener,
    // setup focused the first field. The Train screen re-renders every card
    // every two seconds for the rest marker, which yanked focus out of the
    // movement search to the swap icon on a timer while she typed.
    const hook = fs.readFileSync("lib/use-dialog.ts", "utf8");
    expect(hook).toMatch(/const close = useRef\(onClose\)/);
    expect(hook).toMatch(/if \(e\.key === "Escape"\) \{ close\.current\(\); return; \}/);
    expect(hook).not.toMatch(/\}, \[onClose\]\);\n\n  return panel;/);
  });
});

suite("a movement cannot be swapped onto one already in the day", () => {
  it("both relabel and substitute refuse, and say why", () => {
    // Relabelling curls as hammer curls when hammer curls were already there
    // made a second row for one movement, and every screen that groups a day
    // by movement showed the two lists of sets as one.
    const src = fs.readFileSync("lib/tools/swaps.ts", "utf8");
    const matches = src.match(/is already in that day's session\. Remove one of them first/g) ?? [];
    expect(matches).toHaveLength(2);
    expect(src).toMatch(/eq\(planExercises\.exerciseId, to\.id\)/);
    expect(src).toMatch(/eq\(planExercises\.exerciseId, replacement\.id\)/);
  });
});

suite("a logged set can be removed directly", () => {
  const card = () => fs.readFileSync("components/train-client.tsx", "utf8");

  it("has a long-press / right-click menu with Remove", () => {
    // "Let me just delete it" — without the three-tap trip through the set
    // editor and its Delete button.
    const c = card();
    expect(c).toMatch(/function SetSquare\(/);
    expect(c).toMatch(/onContextMenu=\{editable \? \(e\) => \{ e\.preventDefault\(\); setMenu\(true\); \}/);
    expect(c).toMatch(/setTimeout\(\(\) => \{ if \(!moved\.current\) setMenu\(true\); \}, 450\)/);
    expect(c).toMatch(/onClick=\{\(\) => \{ setMenu\(false\); onRemove\(\); \}\}/);
  });

  it("removes it with delete_set, optimistically", () => {
    const c = card();
    expect(c).toMatch(/async function removeSet\(setNumber: number\)/);
    expect(c).toMatch(/await action\("delete_set", \{\n\s*exerciseSlug: exercise\.slug, setNumber,/);
  });

  it("does not open a smooth scroll that steals the tap on iOS", () => {
    // A scroll animation still running when her thumb lands moves the button
    // out from under it and iOS cancels the click.
    expect(card()).toMatch(/scrollIntoView\(\{ block: "nearest", behavior: "auto" \}\)/);
    expect(card()).not.toMatch(/scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
  });

  it("lets an empty square open the new-set entry even mid-edit", () => {
    // The entry is hidden while a set is being edited, so a tap on an empty
    // square did nothing until she cancelled the editor by hand.
    expect(card()).toMatch(/onClick=\{\(e\) => \{ setEditingSet\(null\); openCard\(e\); \}\}/);
  });
});

suite("a finished movement looks finished", () => {
  it("gets a green edge and a pale green wash, not just a tick", () => {
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/targetMet && !upNext \? "done-card" : ""/);
    const css = fs.readFileSync("app/globals.css", "utf8");
    const rule = css.slice(css.indexOf(".done-card {"), css.indexOf("}", css.indexOf(".done-card {")));
    expect(rule).toMatch(/border-color: var\(--color-beat\)/);
    expect(rule).toMatch(/linear-gradient/);
  });
});
