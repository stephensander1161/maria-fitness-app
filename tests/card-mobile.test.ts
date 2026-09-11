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
    // Written against the budget rather than a number: it was two three-line
    // bullets, which stopped overflowing the day the page got taller and made
    // this assert the opposite of what it says.
    const pages = cuePages(cueItems([long(LINES_PER_PAGE), long(LINES_PER_PAGE)], [], null));
    expect(pages).toHaveLength(2);
    // …and a page's worth is still one page.
    expect(cuePages(cueItems([long(LINES_PER_PAGE)], [], null))).toHaveLength(1);
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
    /*
      Measured, not chosen — and re-measured, because the first measurement
      outlived the layout it was taken against. On the longest guide in the
      library (pelvic floor activation, 22 lines) with two sets logged, the Log
      button clears the tab bar by 228px on a 14 Pro and 136px on an SE. Eight
      lines spends about 60 of that and takes the same entry from six pages to
      three.

      The pair has to move together: the cap in the card is the same budget
      from the other side, and a page allowed more lines than the box can show
      is a page that clips.
    */
    expect(LINES_PER_PAGE).toBe(8);
    expect(fs.readFileSync("components/train-client.tsx", "utf8")).toMatch(/max-h-\[148px\]/);
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

suite("paging the cues is not swipe-only", () => {
  it("gives the gesture a taller band without a taller box", () => {
    /*
      Four lines is the measurement that keeps the Log button clear of the tab
      bar, and inside 84px the browser reads most drags as vertical — it picks
      the axis from the first few pixels. The padding doubles what is
      touchable; the negative margin hands the layout back, so nothing below
      moves.
    */
    expect(cues).toMatch(/-my-3 flex snap-x snap-mandatory[^"]*py-3/);
    // Still capped: the height budget is the reason any of this exists.
    expect(cues).toMatch(/max-h-\[148px\]/);
  });

  it("makes the dots the reliable way through", () => {
    // They were `aria-hidden` decoration, so the gesture was the only way to
    // page — and the gesture is the thing that keeps failing.
    const dots = cues.slice(cues.indexOf("pages.length > 1 &&"));
    expect(dots).toMatch(/onClick=\{\(\) => go\(i\)\}/);
    expect(dots).toMatch(/aria-label=\{`Page \$\{i \+ 1\} of \$\{pages\.length\}`\}/);
    expect(dots).toMatch(/aria-current=/);
    // A target, not a 4px dot.
    expect(dots).toMatch(/h-6 w-6/);
  });

  it("scrolls the strip rather than re-rendering it", () => {
    // Smooth-scrolling the real element keeps `at` coming from onScroll, so
    // the dot and the panel can never disagree.
    expect(cues).toMatch(/el\.scrollTo\(\{ left: i \* el\.clientWidth, behavior: "smooth" \}\)/);
  });
});

suite("a page is exactly one page wide", () => {
  it("puts the gutters on the page, not on the scroller", () => {
    /*
      With `px-4` on the strip a `w-full` page was the *padded* width, so the
      next one bled in at the right — a sliver of a wrapped paragraph, clipped
      mid-word, which reads as broken text rather than as a peek. It got worse
      the taller the box grew.
    */
    const strip = cues.slice(cues.indexOf("ref={strip}"), cues.indexOf("pages.map"));
    expect(strip).not.toMatch(/\bpx-4\b/);
    expect(cues).toMatch(/max-h-\[148px\] w-full shrink-0 snap-start[^"]*px-4/);
  });
});
