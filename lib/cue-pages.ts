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
 * Four, measured rather than chosen: on an iPhone 14 Pro the tab bar starts at
 * 596px, and four lines puts the bottom of the Log button at 572 for the
 * longest entries in the library (barbell bench press, dumbbell pullover,
 * pelvic floor activation). The card caps a page at 84px for the same reason
 * from the other side — one five-line bullet was enough on its own to push the
 * button under the bar.
 */
export const LINES_PER_PAGE = 4;

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
