"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Come back to the app, see what is actually true.
 *
 * There was a "Refresh" button in the desktop sidebar, which is the app asking
 * her to do its job: nothing on this screen is stale by choice, and no one
 * should have to know that a server-rendered page needs telling. Returning to
 * the tab is the signal — she logged a set on her phone, or left this open
 * overnight and it is now a different day.
 *
 * Throttled, because switching windows is not a request for a round trip every
 * time, and skipped when a dialog is open — refreshing under an open coach
 * sheet or a form loses what she was in the middle of.
 */
const MIN_GAP_MS = 15_000;

export function RefreshOnFocus() {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    const maybe = () => {
      if (document.visibilityState !== "visible") return;
      if (document.querySelector("[role=dialog]")) return;
      const now = Date.now();
      if (now - last.current < MIN_GAP_MS) return;
      last.current = now;
      router.refresh();
    };
    document.addEventListener("visibilitychange", maybe);
    window.addEventListener("focus", maybe);
    return () => {
      document.removeEventListener("visibilitychange", maybe);
      window.removeEventListener("focus", maybe);
    };
  }, [router]);

  return null;
}
