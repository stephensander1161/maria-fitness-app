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

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = panel.current;

    const focusable = () => {
      if (!node) return [] as HTMLElement[];
      return [...node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
    };

    // Into the panel, but never stealing the caret from a field it autofocused.
    const first = focusable()[0];
    if (node && !node.contains(document.activeElement)) first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
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
  }, [onClose]);

  return panel;
}
