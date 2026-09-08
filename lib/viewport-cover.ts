/**
 * How much of the bottom of the page a browser's own toolbar is sitting on.
 *
 * Chrome on iOS lays its bottom toolbar *over* the page rather than shrinking
 * the page to fit above it, so anything at `bottom: 0` — the tab bar, every
 * sheet's composer — is behind the toolbar and cannot be reached. Safari does
 * not do this. The Visual Viewport API reports what is actually visible; the
 * difference from the layout viewport is the covered strip, and it goes into
 * `--covered-bottom` on <html> for every bottom-anchored surface to add on.
 *
 * Pure, so the rule is tested: the on-screen keyboard also shrinks the visual
 * viewport, by far more than any toolbar, and lifting the tab bar onto the
 * keyboard would be worse than the original problem — so anything past
 * `TOOLBAR_MAX` is treated as a keyboard and ignored. So is a pinch zoom,
 * for the same reason.
 */
export const TOOLBAR_MAX = 160;

export function coveredBottom(v: { innerHeight: number; offsetTop: number; height: number; scale: number }): number {
  if (v.scale !== 1) return 0;
  const covered = Math.round(v.innerHeight - (v.offsetTop + v.height));
  if (covered <= 0 || covered > TOOLBAR_MAX) return 0;
  return covered;
}

/** The CSS every bottom-anchored surface adds to its safe-area padding. */
export const COVERED = "var(--covered-bottom, 0px)";

/**
 * How tall the visible page actually is, for anything sized to fill it.
 *
 * `dvh` is supposed to be this and on Chrome for iOS it is not: it resolves
 * against the viewport with the toolbars retracted, so a sheet at `86dvh`
 * comes out taller than the strip between the address bar and the toolbar and
 * its top is clipped away off-screen. That is the set sheet opening with its
 * own title missing.
 *
 * Unlike `coveredBottom` this does *not* ignore the keyboard: a keyboard
 * really has taken the space, and a sheet that keeps its full height behind
 * one is the same clipped sheet again. A pinch zoom is still ignored —
 * nothing should resize because she zoomed in to read something.
 */
export function visibleHeight(v: { height: number; scale: number }): number | null {
  if (v.scale !== 1) return null;
  if (!Number.isFinite(v.height) || v.height <= 0) return null;
  return Math.round(v.height);
}

/**
 * The tallest a centred sheet may be: what is visible, less the scrim's own
 * padding. Falls back to `dvh` on a browser with no Visual Viewport API,
 * which is every browser that gets `dvh` right anyway.
 */
export const SHEET_MAX = "min(86dvh, calc(var(--visual-height, 86dvh) - 2.5rem))";
