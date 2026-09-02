"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** How far she has to pull before letting go actually reloads. */
const THRESHOLD = 72;
/** Pull is damped so the sheet never tracks the finger one-for-one. */
const RESISTANCE = 0.45;
const MAX_PULL = 140;

/**
 * Pull down at the top of a page to reload it.
 *
 * It used to fetch something to read while you waited, which was the wrong
 * home for it twice over: hidden behind a gesture, gone the moment your thumb
 * lifted, and recorded as seen either way. The fact lives at the bottom of
 * every screen now — see components/daily-fact.tsx — and this does the one
 * thing its name says.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Kept in state, not a ref: the transition depends on it at render time,
  // and reading a ref there is exactly what React 19 forbids.
  const [dragging, setDragging] = useState(false);

  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      // Only from a genuine resting position at the top. Mid-scroll pulls are
      // the browser's job, not ours.
      if (window.scrollY > 0 || refreshing) return;

      // The overlays scroll inside themselves, so the page's scrollY is 0 the
      // whole time one is open. Without this, dragging down to scroll back up
      // inside a form guide mid-set moved the page underneath instead, and
      // letting go reloaded a screen she never asked to reload.
      const target = e.target as Element | null;
      if (target?.closest?.("[data-no-pull-to-refresh]")) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
      setDragging(true);
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;

      if (dy <= 0 || window.scrollY > 0) {
        active.current = false;
        setDragging(false);
        setPull(0);
        return;
      }

      // Non-passive so this can win against the browser's own overscroll.
      e.preventDefault();
      const distance = Math.min(MAX_PULL, dy * RESISTANCE);
      setPull(distance);
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      setDragging(false);
      startY.current = null;

      setPull((current) => {
        if (current >= THRESHOLD) {
          setRefreshing(true);
          router.refresh();
          // The refresh is not awaitable, so hold the indicator briefly rather
          // than snapping back before the new content lands.
          window.setTimeout(() => setRefreshing(false), 700);
          return THRESHOLD;
        }
        return 0;
      });
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refreshing, router]);

  const offset = refreshing ? THRESHOLD : pull;
  const ready = pull >= THRESHOLD;

  return (
    <>
      <div
        aria-hidden={offset === 0}
        className="pointer-events-none fixed inset-x-0 top-0 z-0 flex justify-center overflow-hidden px-6"
        style={{ height: `${offset}px`, opacity: Math.min(1, offset / 40) }}
      >
        <div className="mx-auto flex w-full max-w-lg flex-col justify-end pb-2 text-center">
            <p className="text-[11px] text-faint">
              {refreshing ? "Refreshing…" : ready ? "Let go to refresh" : "Pull to refresh"}
            </p>
        </div>
      </div>

      <div
        style={{
          transform: `translateY(${offset}px)`,
          transition: dragging ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {children}
      </div>
    </>
  );
}
