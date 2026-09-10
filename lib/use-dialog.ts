"use client";

import { useEffect, useRef } from "react";

/**
 * What a sheet has to do to be a dialog rather than a div that looks like one.
 *
 * Escape closes it, focus goes into it and stays there, and focus comes back
 * to whatever opened it. Without the trap, Tab walked out of the coach sheet
 * into the Train screen underneath — where she could log sets and remove
 * exercises she could not see — while `aria-modal="true"` told her screen
 * reader the rest of the page was inert. Saying it and not doing it is worse
 * than doing neither.
 *
 * And the page behind it holds still. A thumb dragging on the phone menu was
 * scrolling the Train screen underneath while the sheet stayed put — the
 * same "inert" lie, by touch. The document's scrolling is switched off while
 * a dialog is open and put back exactly as it was; the panel itself scrolls
 * (`overscroll-contain`, so reaching its end does not hand the gesture on).
 *
 * Returns a ref to put on the panel itself.
 */
export function useDialog(onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  /**
   * The latest close handler, read at the moment Escape is pressed.
   *
   * The effect below used to depend on `onClose` directly, and every caller
   * passes an inline arrow — a new function on every render. So every render
   * of the sheet tore the dialog down and set it up again: the cleanup handed
   * focus back to the button that opened it, the setup focused the first
   * field. The Train screen re-renders every card every two seconds for the
   * rest marker's pulse, which meant that while she typed in the movement
   * search, focus was yanked to the swap icon on a two-second timer.
   */
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = panel.current;

    const focusable = () => {
      if (!node) return [] as HTMLElement[];
      return [...node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
    };

    // Into the panel *itself*, not into the first control in it.
    //
    // The first control is whatever happens to be highest in the markup, and
    // on the open set card that is now the target's own number field: opening
    // a card to log a set put the caret in "Target sets", raised the keyboard,
    // and made the next thing she typed a change to the target. Focusing the
    // panel satisfies what the trap is for — Tab starts inside, Escape closes,
    // the screen reader lands in the dialog — without choosing a field on her
    // behalf. A dialog that genuinely wants a field focused marks it
    // `autoFocus`, which runs before this and is left alone by the check
    // below.
    if (node && !node.contains(document.activeElement)) {
      if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
      node.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab" || !node) return;

      const items = focusable();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!node.contains(active)) { e.preventDefault(); firstEl.focus(); return; }
      if (e.shiftKey && active === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus(); }
    };

    window.addEventListener("keydown", onKey);

    // Pinning the body at its current offset, rather than only hiding the
    // root's overflow: hiding overflow on the root sends the page to the top
    // in Chromium, so she came back from the menu to a different place on the
    // screen than she left. Pinned, nothing visibly moves; on close the
    // offset is put back before the paint.
    const root = document.documentElement;
    const body = document.body;
    const y = window.scrollY;
    const was = {
      overflow: root.style.overflow, overscroll: root.style.overscrollBehavior,
      position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right,
    };
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";

    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = was.overflow;
      root.style.overscrollBehavior = was.overscroll;
      body.style.position = was.position;
      body.style.top = was.top;
      body.style.left = was.left;
      body.style.right = was.right;
      window.scrollTo(0, y);
      // Back where she was, or the next Tab starts from the top of the page.
      // Without preventScroll this was the jump: the menu button is at the
      // top of the page, and focusing it scrolled her there.
      opener?.focus?.({ preventScroll: true });
    };
    // Once, for the life of the dialog — see `close` above.
  }, []);

  return panel;
}
