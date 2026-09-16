/**
 * The movement's guide, split into swipeable pages.
 *
 * The card was a stacked list, which is the right density — several bullets
 * read at once — but it grew with whatever the library happened to say about
 * that movement, and on the long entries it pushed the sets and the entry
 * below the fold. One panel per bullet fixed the height and went too far the
 * other way: nine pages to read four cues.
 *
 * So the list stays a list. It only becomes swipeable when it would overflow,
 * and then it keeps going for as long as there is something to read — every
 * page is one flick, and stopping short to send her somewhere else for the
 * rest is a worse answer than one more flick.
 *
 * Order is still deliberate: cues, then the safety note, then the common
 * mistakes. Nothing is dropped now, but the warning still belongs before the
 * list of ways to get it slightly wrong.
 */
export type CueItem = { kind: "cue" | "safety" | "miss" | "heading"; text: string; n?: number };

/**
 * Lines a bullet takes at 12px on a phone. A rough count on purpose: it only
 * decides where a page breaks, and being one line out moves a bullet rather
 * than breaking anything.
 */
export const CHARS_PER_LINE = 44;
/**
 * Lines a page shows on a phone.
 *
 * Five. It was measured — eight, then four, then eight again — against a
 * card that was being squeezed into the screen, and every measurement was
 * left behind by the next layout. The card is as tall as its content now and
 * the page scrolls, so this is not a budget any more, it is a reading size:
 * a page she takes in at a glance, with the dots to move through the rest.
 * Five puts the set squares on screen without a scroll on a 14 Pro with the
 * header up, and takes the longest guide in the library to five pages.
 */
export const LINES_PER_PAGE = 5;

/**
 * What one of those lines costs, in pixels: 12px text at `leading-snug`
 * (1.375) plus the 4px `space-y-1` between bullets, rounded up.
 *
 * The strip measures the room the column has left and divides by this, so the
 * page count follows the phone, the keyboard and how many sets are logged
 * rather than a constant somebody measured once on one handset. See FullCues.
 */
export const CUE_LINE_PX = 21;

export const linesOf = (text: string): number =>
  Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));

/**
 * The heading the phone had lost.
 *
 * The desktop panel has always said "Common mistakes" over that list. The
 * phone flattened everything into one stream and marked a mistake with a
 * middle dot and a paler grey — so two bullets reading "Going above shoulder
 * height" and "Too heavy: built with control, not load" arrived looking like
 * instructions rather than like the things not to do. Told to do the first one
 * and told *off* for it read identically.
 *
 * "you dropped the common mistakes heading on mobile which is wrong should
 * keep."
 */
export const MISTAKES_HEADING = "Common mistakes";

export function cueItems(
  formCues: readonly string[],
  commonMistakes: readonly string[],
  safetyNote: string | null,
): CueItem[] {
  return [
    ...formCues.map((text, i) => ({ kind: "cue" as const, text, n: i + 1 })),
    ...(safetyNote ? [{ kind: "safety" as const, text: safetyNote }] : []),
    ...(commonMistakes.length > 0 ? [{ kind: "heading" as const, text: MISTAKES_HEADING }] : []),
    ...commonMistakes.map((text) => ({ kind: "miss" as const, text })),
  ];
}

export function cuePages(
  items: readonly CueItem[],
  { perPage = LINES_PER_PAGE }: { perPage?: number } = {},
): CueItem[][] {
  if (items.length === 0) return [];

  const total = items.reduce((t, i) => t + linesOf(i.text), 0);
  // Fits as it always did: one page, no dots, nothing to swipe.
  if (total <= perPage) return [[...items]];

  const pages: CueItem[][] = [];
  let page: CueItem[] = [];
  let used = 0;
  for (const [i, item] of items.entries()) {
    const cost = linesOf(item.text);
    /*
      A heading never ends a page.

      Left dangling it is worse than absent: "Common mistakes" as the last line
      of one page and the mistakes on the next reads as a heading for nothing,
      and the reader has to swipe to find out it was not. So it takes its first
      item with it — and the cost it is measured against is both.
    */
    const withNext = item.kind === "heading" && i + 1 < items.length
      ? cost + linesOf(items[i + 1].text)
      : cost;
    // A bullet taller than a whole page still gets one — better a clipped
    // paragraph than an empty page followed by it.
    if (page.length > 0 && used + withNext > perPage) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(item);
    used += cost;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}
