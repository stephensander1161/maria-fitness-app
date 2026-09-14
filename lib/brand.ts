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

/* --------------------------------------------------------- the others --- */

/**
 * The marks that are not the barbell, as geometry.
 *
 * All three came out of one afternoon of drawing the same wrong thing. Six
 * attempts at a shoulder plate were symmetrical domes, and a dome reads as a
 * bell, a hat, a burger or a bowl — in that order, at every size. The
 * reference that fixed it was the side of a Japanese roof: a high ridge, sides
 * that sweep down **concave** rather than straight, and corners that flick out
 * and up into points. That line is what makes it armour instead of a shell,
 * and it is the same line in all three of these.
 *
 * They are single filled paths rather than stacked bands. Bands closed into a
 * blob at 16px; a silhouette survives anywhere, which is the whole argument
 * for drawing a shape instead of a picture of one.
 *
 * Every one keeps its corners clear of the badge's rounded edge. A sheared tip
 * is a flat one, and the upturned corners are the only feature that makes any
 * of these legible small — the first pauldron put them at x = 1.4 and lost
 * both of them in the sidebar at 26px.
 */
export type MarkPath = { d: string };

/** Half a roof: the shoulder plate. A pauldron is one eave, not two. */
export const PAULDRON: MarkPath = {
  d: "M34.5 12.5 C32.8 17.6 26 25 15.6 30.4 L8.6 23.6 L15.4 33.8 Q24 35.8 35.6 34 L34.5 12.5 Z",
};

/** …and the whole roof, for anyone who wants the temple rather than the armour. */
export const TEMPLE_ROOF: MarkPath = {
  d:
    "M24 10.2 C25.2 15 31.6 23 39.8 29 L44.6 22.6 L39.4 32.5 " +
    "Q24 34.5 8.6 32.5 L3.4 22.6 L8.2 29 C16.4 23 22.8 15 24 10.2 Z",
};

/**
 * Lamellar: a narrow cap with plates fanning out under it.
 *
 * The cap being *narrower* than the lames is what makes it a stack rather
 * than a dome, and the tilt is what says it sits on a shoulder.
 */
export const LAMELLAR: { lames: string[]; rotate: number } = {
  lames: [
    "M14 26.6 Q13.8 15.2 22.6 12.6 Q31.8 10 34.4 18.8 Q35.4 22.8 35 26.6 Q24 22.8 14 26.6 Z",
    "M10.8 29.4 Q24 24.2 38 29.4 L37 33.6 Q24 28.4 11.8 33.6 Z",
    "M7.6 36 Q24 30.4 40.4 36 L40 39.4 L8 39.4 Z",
  ],
  rotate: -11,
};
