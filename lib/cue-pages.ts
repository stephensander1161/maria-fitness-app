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
export type CueItem = { kind: "cue" | "safety" | "miss"; text: string; n?: number };

/**
 * Lines a bullet takes at 12px on a phone. A rough count on purpose: it only
 * decides where a page breaks, and being one line out moves a bullet rather
 * than breaking anything.
 */
export const CHARS_PER_LINE = 44;
/**
 * Lines a page shows.
 *
 * Eight, re-measured. It was four, and four was measured — but against a card
 * that has since lost a row and gained a fold, and nobody went back. The
 * figure it was protecting was 24px of clearance under the Log button; the
 * real clearance today, on the longest guide in the library (pelvic floor
 * activation, 22 lines) with two sets logged so the squares and the tank row
 * are both up, is **228px on an iPhone 14 Pro and 136px on an SE**.
 *
 * So the window was small for a reason that had stopped being true, and a
 * small window is the whole complaint: a sideways drag is hard to start in a
 * band that short, because the browser picks the axis from the first few
 * pixels of the gesture. Eight lines roughly doubles it and takes that same
 * worst entry from six pages to three, and still leaves about 76px of
 * clearance on the smallest phone this app supports.
 *
 * If the card grows a row again, measure again — the number is a measurement,
 * not a preference, and this is the second time it has been left behind by
 * the layout it was measured against.
 */
export const LINES_PER_PAGE = 8;

export const linesOf = (text: string): number =>
  Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));

export function cueItems(
  formCues: readonly string[],
  commonMistakes: readonly string[],
  safetyNote: string | null,
): CueItem[] {
  return [
    ...formCues.map((text, i) => ({ kind: "cue" as const, text, n: i + 1 })),
    ...(safetyNote ? [{ kind: "safety" as const, text: safetyNote }] : []),
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
  for (const item of items) {
    const cost = linesOf(item.text);
    // A bullet taller than a whole page still gets one — better a clipped
    // paragraph than an empty page followed by it.
    if (page.length > 0 && used + cost > perPage) {
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
