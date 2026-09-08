import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { allowanceLeftPct, ALLOWANCE_WARN_PCT } from "@/lib/allowance-pct";
import { nextAfter } from "@/components/train-client";

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
    expect(card).toMatch(/upNext \? "border-accent" : ""/);
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
