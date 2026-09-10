import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { cueItems, cuePages, LINES_PER_PAGE, MAX_PAGES } from "@/lib/cue-pages";

const card = fs.readFileSync("components/train-client.tsx", "utf8");
const cues = card.slice(card.indexOf("function FullCues"));

const long = (n: number) => "x".repeat(n * 44);

suite("the guide is a list until it cannot be", () => {
  it("leaves a short movement exactly as it was", () => {
    // A stacked list is the right density — several bullets read at once. One
    // panel per bullet fixed the card's height and went too far the other way:
    // nine pages to read four cues.
    const { pages, truncated } = cuePages(cueItems(["a", "b", "c"], [], null));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("splits into two only when it overflows", () => {
    const { pages } = cuePages(cueItems([long(3), long(3), long(3)], [], null));
    expect(pages).toHaveLength(2);
  });

  it("never becomes a third page", () => {
    // A third is a document, and the movement's own page already is one.
    const many = Array.from({ length: 20 }, (_, i) => `${i} ${long(2)}`);
    const { pages, truncated } = cuePages(cueItems(many, [], null));
    expect(pages.length).toBeLessThanOrEqual(MAX_PAGES);
    expect(truncated).toBe(true);
  });

  it("drops mistakes before it drops a warning", () => {
    // Order is what stops the important thing being the thing that falls off.
    const items = cueItems([long(3), long(3)], ["mistake one", "mistake two"], "SAFETY");
    const kept = cuePages(items).pages.flat().map((i) => i.text);
    expect(kept).toContain("SAFETY");
    expect(kept).not.toContain("mistake two");
  });

  it("gives an over-long bullet a page rather than an empty one", () => {
    const { pages } = cuePages(cueItems([long(30), "short"], [], null));
    expect(pages[0]).toHaveLength(1);
    expect(pages[0][0].text).toHaveLength(30 * 44);
  });

  it("budgets to what actually fits a phone", () => {
    // Measured, not chosen: on an iPhone 14 Pro the tab bar starts at 596 and
    // five lines puts the Log button at 580 for the longest entries in the
    // library. Six puts barbell bench press at 617 — behind the tab bar.
    expect(LINES_PER_PAGE).toBe(5);
  });
});

suite("the card is one screen on a phone", () => {
  it("swipes sideways, and only sideways", () => {
    expect(cues).toMatch(/snap-x snap-mandatory/);
    // Without touch-pan-x the strip eats a vertical swipe, so the gesture that
    // should scroll the page does nothing over a third of the card.
    expect(cues).toMatch(/touch-pan-x/);
    // And swiping past the last page must not be the browser's back gesture.
    expect(cues).toMatch(/overscroll-x-contain/);
  });

  it("hides nothing behind a control", () => {
    // It was behind a fold, then open-by-default behind a fold — a disclosure
    // whose only useful state is open is a row that invites a tap to hide what
    // she came to read.
    expect(cues).not.toMatch(/Show help|show more|See cues|aria-expanded/i);
  });

  it("says where the rest is when something did not fit", () => {
    expect(cues).toMatch(/Full guide/);
    expect(cues).toMatch(/truncated && i === pages\.length - 1/);
  });

  it("keeps the stacked list on desktop", () => {
    expect(cues).toMatch(/hidden space-y-3[^"]*md:block/);
    expect(cues).toMatch(/className="md:hidden"/);
  });

  it("keeps the tank row to one tidy line on a phone", () => {
    // It was a shouted label above four stretched buttons — a lot of furniture
    // for an optional question sitting between the reps she just typed and the
    // button that sends them. 40px pills, right-aligned, still a real target.
    const tank = card.slice(card.indexOf("Left in tank") - 900, card.indexOf("Left in tank") + 900);
    expect(tank).toMatch(/size-10 shrink-0/);
    expect(tank).toMatch(/md:size-auto md:flex-1/);
    expect(tank).not.toMatch(/min-w-11 flex-1/);
  });
});
