import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { cueItems, cuePages, LINES_PER_PAGE } from "@/lib/cue-pages";

const card = fs.readFileSync("components/train-client.tsx", "utf8");
const cues = card.slice(card.indexOf("function FullCues"));

const long = (n: number) => "x".repeat(n * 44);

suite("the guide is a list until it cannot be", () => {
  it("leaves a short movement exactly as it was", () => {
    // A stacked list is the right density — several bullets read at once. One
    // panel per bullet fixed the card's height and went too far the other way:
    // nine pages to read four cues.
    const pages = cuePages(cueItems(["a", "b", "c"], [], null));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(3);
  });

  it("splits into two only when it overflows", () => {
    const pages = cuePages(cueItems([long(3), long(3)], [], null));
    expect(pages).toHaveLength(2);
  });

  it("keeps paging for as long as there is something to read", () => {
    // Capped at two, a long movement had to send her somewhere else for the
    // rest. Every page is one flick, and one more flick beats a link.
    const many = Array.from({ length: 20 }, (_, i) => `${i} ${long(2)}`);
    const pages = cuePages(cueItems(many, [], null));
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flat()).toHaveLength(20);
  });

  it("loses nothing at all", () => {
    const items = cueItems([long(3), long(3)], ["mistake one", "mistake two"], "SAFETY");
    const kept = cuePages(items).flat().map((i) => i.text);
    expect(kept).toContain("SAFETY");
    expect(kept).toContain("mistake two");
    expect(kept).toHaveLength(items.length);
  });

  it("still puts the warning before the ways to get it wrong", () => {
    const items = cueItems(["cue"], ["mistake"], "SAFETY");
    expect(items.map((i) => i.kind)).toEqual(["cue", "safety", "miss"]);
  });

  it("gives an over-long bullet a page rather than an empty one", () => {
    const pages = cuePages(cueItems([long(30), "short"], [], null));
    expect(pages[0]).toHaveLength(1);
    expect(pages[0][0].text).toHaveLength(30 * 44);
  });

  it("budgets to what actually fits a phone", () => {
    // Measured, not chosen. On an iPhone 14 Pro the tab bar starts at 596px;
    // with the tank label on its own row, four lines a page puts the bottom of
    // the Log button at 572 for the longest entries in the library. The 84px
    // cap in the card is the same measurement from the other side — one
    // five-line bullet was enough to push the button 5px under the bar.
    expect(LINES_PER_PAGE).toBe(4);
    expect(fs.readFileSync("components/train-client.tsx", "utf8")).toMatch(/max-h-\[84px\]/);
  });
});

suite("the card is one screen on a phone", () => {
  it("pages sideways without eating a vertical swipe", () => {
    expect(cues).toMatch(/snap-x snap-mandatory/);
    // `touch-action: pan-x` kept the paging clean and swallowed every up-or-
    // down drag that started inside the box, which on a card this size is
    // most of them. The default picks the axis from the gesture.
    expect(cues).not.toMatch(/touch-pan-x/);
    // Swiping past the last page must still not be the browser's back gesture.
    expect(cues).toMatch(/overscroll-x-contain/);
  });

  it("hides nothing behind a control", () => {
    // It was behind a fold, then open-by-default behind a fold — a disclosure
    // whose only useful state is open is a row that invites a tap to hide what
    // she came to read.
    expect(cues).not.toMatch(/Show help|show more|See cues|aria-expanded/i);
  });

  it("never sends her elsewhere for the rest of it", () => {
    expect(cues).not.toMatch(/Full guide/);
  });

  it("keeps the stacked list on desktop", () => {
    expect(cues).toMatch(/hidden space-y-3[^"]*md:block/);
    expect(cues).toMatch(/className="md:hidden"/);
  });

  it("keeps the tank row to one tidy line on a phone", () => {
    // Four tall stretched buttons was a lot of furniture for an optional
    // question sitting between the reps she just typed and the button that
    // sends them. Same shape, a third less height.
    const tank = card.slice(card.indexOf("Left in tank") - 900, card.indexOf("Left in tank") + 1200);
    // Label on its own line, buttons in a row under it, shorter on a phone.
    expect(tank).toMatch(/h-9 flex-1/);
    expect(tank).toMatch(/md:h-auto md:py-2\.5/);
    expect(tank).not.toMatch(/min-w-11 flex-1/);
  });
});
