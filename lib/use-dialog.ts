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
    if (node && !node.contains(document.activeElement)) first?.focus();

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
    return () => {
      window.removeEventListener("keydown", onKey);
      // Back where she was, or the next Tab starts from the top of the page.
      opener?.focus?.();
    };
  }, [onClose]);

  return panel;
}
