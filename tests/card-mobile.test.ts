import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { CUE_LINE_PX, cueItems, cuePages, LINES_PER_PAGE, MISTAKES_HEADING } from "@/lib/cue-pages";

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

  it("still puts the warning before the ways to get it wrong, and names them", () => {
    // The heading the phone had lost: a mistake was marked only by a middle
    // dot and a paler grey, so "go above shoulder height" arrived looking like
    // an instruction. See MISTAKES_HEADING.
    const items = cueItems(["cue"], ["mistake"], "SAFETY");
    expect(items.map((i) => i.kind)).toEqual(["cue", "safety", "heading", "miss"]);
    expect(items[2].text).toBe(MISTAKES_HEADING);
    // No mistakes, no heading for them.
    expect(cueItems(["cue"], [], "SAFETY").map((i) => i.kind)).toEqual(["cue", "safety"]);
  });

  it("never leaves a heading at the bottom of a page", () => {
    /*
      Dangling, it is worse than absent: "Common mistakes" as the last line of
      one page with the mistakes on the next reads as a heading for nothing,
      and she has to swipe to find out it was not. It takes its first item with
      it, and is measured against the pair.
    */
    const pages = cuePages(cueItems([long(3), long(3)], ["a mistake"], null), { perPage: 7 });
    for (const page of pages) {
      expect(page.at(-1)?.kind, JSON.stringify(page.map((i) => i.kind))).not.toBe("heading");
    }
    // …and it is still on the same page as what it heads.
    const heading = pages.findIndex((p) => p.some((i) => i.kind === "heading"));
    expect(pages[heading].some((i) => i.kind === "miss")).toBe(true);
  });

  it("gives an over-long bullet a page rather than an empty one", () => {
    const pages = cuePages(cueItems([long(30), "short"], [], null));
    expect(pages[0]).toHaveLength(1);
    expect(pages[0][0].text).toHaveLength(30 * 44);
  });

  it("budgets to the room it actually has, not to a constant", () => {
    /*
      The budget was a number in a file, and the comment on it said — twice —
      that it had been left behind by the layout it was measured against. A
      constant cannot know this is an SE, that two sets are logged so the
      squares and the tank row are both up, or that the keyboard is open. So
      the strip measures what the column left it and divides by a line.

      "Should be dynamic to fit and any overflow goes on the next horizontal
      scroll page."

      `LINES_PER_PAGE` survives as the value before the first measurement
      lands, which is one frame.
    */
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/setPerPage\(Math\.max\(2, Math\.floor\(room \/ CUE_LINE_PX\)\)\)/);
    // The box clips and the wrapper keeps two lines plus the dots, so a
    // squeezed column can never again draw the guide over the set squares.
    expect(cues).toMatch(/min-h-0 flex-1 overflow-hidden/);
    expect(cues).toMatch(/flex min-h-\[74px\] flex-1 flex-col md:hidden/);
    // No viewport listener here: the bar collapsing fires one on every
    // scroll, and the box's own observer already sees every real change.
    expect(cues).not.toMatch(/visualViewport/);
    expect(card).toMatch(/cuePages\(cueItems\(formCues, commonMistakes, safetyNote\), \{ perPage \}\)/);
    expect(card).toMatch(/new ResizeObserver\(measure\)/);
    // And no fixed cap left to clip a page the measurement says fits.
    expect(card).not.toMatch(/max-h-\[148px\]/);
    expect(LINES_PER_PAGE).toBe(8);
    expect(CUE_LINE_PX).toBeGreaterThan(12);
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
    // The phone half is a flex child now, so it can be handed what the column
    // left over — see the budget test above.
    expect(cues).toMatch(/flex min-h-\[74px\] flex-1 flex-col md:hidden/);
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
    // The cap moved from a class to a measurement — the box takes what the
    // column leaves and tells `cuePages` how many lines that is.
    expect(cues).toMatch(/const \[perPage, setPerPage\] = useState\(LINES_PER_PAGE\)/);
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
    expect(cues).toMatch(/w-full shrink-0 snap-start[^"]*px-4/);
  });
});
