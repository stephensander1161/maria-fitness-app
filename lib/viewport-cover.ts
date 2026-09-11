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
/**
 * Below this it is scroll jitter, not a toolbar.
 *
 * The visual viewport shifts by a few pixels through a momentum scroll and a
 * rubber-band, and every one of those fired an update that moved the tab bar.
 * No bottom toolbar is twenty pixels tall, so nothing that small is one.
 */
export const TOOLBAR_MIN = 24;

/**
 * Whether this browser leaves `position: fixed` under its own bottom toolbar.
 *
 * The distinction the rest of this file was missing. iOS Safari pins fixed
 * elements to the *visual* viewport, so `bottom: 0` already sits above its
 * toolbar — adding the strip on top lifted the tab bar a toolbar's height off
 * the bottom of the screen, with the page still visible underneath, and moved
 * it every time the toolbar grew or shrank through a scroll. Chrome and
 * Firefox on iOS do not do that, which is the entire reason this exists.
 *
 * A user-agent test, deliberately, and it fails to *nothing*: an unrecognised
 * browser adds zero, which is correct everywhere except the two named here.
 * Measuring instead would mean laying out a probe element and reading it back
 * on every scroll, for a question whose answer cannot change mid-session.
 */
export function coversFixedElements(ua: string): boolean {
  if (!/iPhone|iPad|iPod/.test(ua)) return false;
  return /CriOS|FxiOS|EdgiOS/.test(ua);
}

export function coveredBottom(v: {
  innerHeight: number; offsetTop: number; height: number; scale: number;
  /** False on a browser that already keeps fixed elements clear of its chrome. */
  overlays?: boolean;
}): number {
  if (v.scale !== 1) return 0;
  if (v.overlays === false) return 0;
  const covered = Math.round(v.innerHeight - (v.offsetTop + v.height));
  if (covered < TOOLBAR_MIN || covered > TOOLBAR_MAX) return 0;
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
