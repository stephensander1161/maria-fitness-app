/**
 * The movement's guide, split into at most two swipeable pages.
 *
 * The card was a stacked list, which is the right density — several bullets
 * read at once — but it grew with whatever the library happened to say about
 * that movement, and on the long entries it pushed the sets and the entry
 * below the fold. One panel per bullet fixed the height and went too far the
 * other way: nine pages to read four cues.
 *
 * So the list stays a list. It only becomes swipeable when it would overflow,
 * and then it is exactly two pages, because a third is a document.
 *
 * Order is deliberate and is what stops the important thing being the thing
 * that falls off: cues, then the safety note, then the common mistakes. A
 * movement long enough to overrun two pages loses the tail of its mistakes
 * list, never its warning.
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
 * Five, measured rather than chosen: on an iPhone 14 Pro the tab bar starts at
 * 596px, and five lines puts the bottom of the Log button at 580 for the
 * longest entries in the library (barbell bench press, dumbbell pullover,
 * pelvic floor activation). Six puts bench at 617, behind the tab bar.
 */
export const LINES_PER_PAGE = 5;
export const MAX_PAGES = 2;

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

export type CuePages = {
  pages: CueItem[][];
  /** Something did not fit even two pages — the card says where the rest is. */
  truncated: boolean;
};

export function cuePages(
  items: readonly CueItem[],
  { perPage = LINES_PER_PAGE, maxPages = MAX_PAGES }: { perPage?: number; maxPages?: number } = {},
): CuePages {
  if (items.length === 0) return { pages: [], truncated: false };

  const total = items.reduce((t, i) => t + linesOf(i.text), 0);
  // Fits as it always did: one page, no dots, nothing to swipe.
  if (total <= perPage) return { pages: [[...items]], truncated: false };

  const pages: CueItem[][] = [];
  let page: CueItem[] = [];
  let used = 0;
  let at = 0;
  for (; at < items.length; at++) {
    const cost = linesOf(items[at].text);
    // A bullet taller than a whole page still gets one — better a clipped
    // paragraph than an empty page followed by it.
    if (page.length > 0 && used + cost > perPage) {
      pages.push(page);
      if (pages.length === maxPages) break;
      page = [];
      used = 0;
    }
    page.push(items[at]);
    used += cost;
  }
  if (pages.length < maxPages && page.length > 0) pages.push(page);

  const shown = pages.reduce((t, p) => t + p.length, 0);
  return { pages, truncated: shown < items.length };
}
