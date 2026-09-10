/**
 * The mark, as geometry.
 *
 * Shared so the React component and the PNG icon routes cannot drift: the
 * routes render through satori, which has no CSS variables, so they need
 * literal colours — but they must not need their own copy of the drawing.
 *
 * **Optical sizing.** The full mark is a bar with two plates, and at 16px in a
 * browser tab that is three strokes inside eleven usable pixels: it turns to
 * mush. So below the threshold the mark is redrawn chunkier — a shorter bar,
 * fatter plates, more space around it. Same idea, fewer pixels asked of it.
 * This is why the icon is not simply the big one scaled down.
 */

/**
 * The icon's tile and its mark, and neither of them follows the theme.
 *
 * It used to be the app's orange on a gradient, which looked like Midnight and
 * like nothing else: pick Turquoise and the tab still said orange. It cannot
 * follow the theme either — a favicon is one URL for the whole origin, fetched
 * without a session and cached by the browser for far longer than a person
 * spends choosing a colour, so "the icon in her theme" is a promise this shape
 * of thing cannot keep for even one visitor, let alone two on one machine.
 *
 * Neutral instead, and deliberately: a white tile with the mark in near-black
 * reads on light browser chrome and on dark, which is the actual job. The one
 * piece of chrome that *does* follow the theme is the address bar colour —
 * `themeColor` in app/layout.tsx, which is rendered per request and is allowed
 * to, because it is a meta tag on a page and not a cached image.
 */
export const BRAND_TILE = "#ffffff";
export const BRAND_MARK = "#0b0e13";

/** Below this, use the chunky drawing. */
export const SMALL_AT = 22;

export type BarbellGeometry = {
  bar: { d: string; width: number };
  plates: { d: string; width: number };
};

/**
 * A loaded bar tilted up to the right, on a 48-unit canvas.
 *
 * The plates run along the *perpendicular* of the bar and are thicker than it.
 * Both matter: the first version used short strokes at a lazy angle and every
 * viewer saw a bone.
 */
export const BARBELL: BarbellGeometry = {
  bar: { d: "M16 28.5 32 18.3", width: 3.6 },
  plates: { d: "M13.8 23.4 20.2 33.6 M27.8 14.4 34.2 24.6", width: 5.2 },
};

/** The same bar with less asked of it: shorter, fatter, further from the edge. */
export const BARBELL_SMALL: BarbellGeometry = {
  bar: { d: "M18.5 27 29.5 20", width: 4.5 },
  plates: { d: "M15.5 22.5 21.5 31.5 M26.5 16.5 32.5 25.5", width: 7.5 },
};

export const barbellFor = (size: number): BarbellGeometry =>
  size < SMALL_AT ? BARBELL_SMALL : BARBELL;

/**
 * How much of an app icon the glyph should occupy.
 *
 * Home-screen icons want air around the mark — filling the tile makes it look
 * like a cropped screenshot, and iOS rounds the corners again on top of ours.
 */
export const ICON_GLYPH_RATIO = 0.72;
