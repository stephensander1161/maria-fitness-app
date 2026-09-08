import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { allowanceLeftPct, ALLOWANCE_WARN_PCT } from "@/lib/allowance-pct";
import { nextAfter } from "@/components/train-client";
import { moveItem, slotFor } from "@/lib/reorder";

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
    expect(card).toMatch(/aria-label=\{`Log set \$\{i \+ 1\} of \$\{exercise\.name\}`\}/);
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
    expect(card).toMatch(/upNext \? "border-beat now-glow" : ""/);
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
    expect(modal).toMatch(/overscroll-contain/);
  });

  it("holds its place in the grid so nothing jumps", () => {
    expect(card).toMatch(/setCollapsedHeight\(shell\.current\?\.offsetHeight\)/);
    expect(card).toMatch(/style=\{\{ height: collapsedHeight \}\}/);
    // Every way in measures first.
    expect(card).not.toMatch(/onClick=\{\(\) => setOpen\(true\)\}/);
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
    expect(card).toMatch(/<CyclingCue cues=\{exercise\.formCues\} \/>/);
    // A movement with one cue does not need a timer running for ever.
    expect(card).toMatch(/if \(cues\.length < 2\) return;/);
    // And never a live region: it repaints on a timer, and announcing each
    // change would talk over everything else the way the countdown once did.
    const cue = card.slice(card.indexOf("function CyclingCue"), card.indexOf("const CUE_MS"));
    expect(cue).not.toMatch(/aria-live|role="status"/);
  });

  it("the card gets out of the way once the set is in", () => {
    // Lifted over the screen, a card that stays open hides the rest timer and
    // the movement that is next.
    const card = read("components/train-client.tsx");
    const logSet = card.slice(card.indexOf("async function logSet"));
    expect(logSet.slice(0, logSet.indexOf("} catch"))).toMatch(/setOpen\(false\)/);
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
    expect(card).toMatch(/onPointerDown=\{onDragStart\}/);
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
    expect(move).toMatch(/setDrag\(\{ slug, dy, from, to, height \}\)/);
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
    expect(card).toMatch(/maxHeight: "94dvh"/);
    expect(card).toMatch(/max-w-lg/);
    expect(card).toMatch(/\? <FullCues exercise=\{exercise\} \/>/);
    expect(card).toMatch(/: <CyclingCue cues=\{exercise\.formCues\} \/>/);
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

  it("the help button opens the card, and is not offered once it is open", () => {
    // The open card already carries the whole library entry, so asking for
    // help there put a second copy of it in a modal on top of the one she
    // was reading.
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/\{!open && \(\s*<button\s*onClick=\{openCard\}/);
    expect(card).toMatch(/aria-label=\{`How to do \$\{exercise\.name\}`\}/);
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
    expect(card).toMatch(/open \? "h-24 w-20" : "h-11 w-9"/);
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
