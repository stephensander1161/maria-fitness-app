import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const card = fs.readFileSync("components/train-client.tsx", "utf8");
const cues = card.slice(card.indexOf("function FullCues"));

suite("the movement card is one screen on a phone", () => {
  it("puts the cues in a fixed-height strip she swipes", () => {
    // Stacked, four cues plus the mistakes plus a safety note pushed the set
    // squares and the entry below the fold — so logging a set meant scrolling
    // past the instructions every time, and the card's height changed with
    // whatever the library happened to say about that movement.
    expect(cues).toMatch(/snap-x snap-mandatory/);
    expect(cues).toMatch(/overflow-x-auto/);
    expect(cues).toMatch(/h-\[68px\]/);
    // One panel per screen, so a swipe moves exactly one.
    expect(cues).toMatch(/w-full shrink-0 snap-start/);
  });

  it("does not hide them behind a control", () => {
    // It was behind a fold, then open-by-default behind a fold — a disclosure
    // whose only useful state is open is a row that invites a tap to hide what
    // she came to read. Everything is on screen; the strip only moves sideways.
    expect(cues).not.toMatch(/Show help|show more|See cues|aria-expanded/i);
  });

  it("leaves a vertical drag to the page", () => {
    // Without touch-pan-x the strip eats a vertical swipe, so the one gesture
    // that should scroll the page does nothing over a third of the card.
    expect(cues).toMatch(/touch-pan-x/);
    // And swiping past the last cue must not trigger the back gesture.
    expect(cues).toMatch(/overscroll-x-contain/);
  });

  it("clamps a panel rather than scrolling inside one", () => {
    // A panel that scrolls inside a strip that scrolls is two gestures
    // fighting for one thumb.
    expect(cues).toMatch(/line-clamp-3/);
  });

  it("keeps the stacked list on desktop", () => {
    // There is room for it there, and it was never the problem.
    expect(cues).toMatch(/hidden space-y-3[^"]*md:block/);
    expect(cues).toMatch(/className="md:hidden"/);
  });
});
