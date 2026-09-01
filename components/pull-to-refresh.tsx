"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";

type Fact = { category: string; fact: string; source: string | null };

/** How far she has to pull before letting go actually reloads. */
const THRESHOLD = 72;
/** Pull is damped so the sheet never tracks the finger one-for-one. */
const RESISTANCE = 0.45;
const MAX_PULL = 140;

/**
 * Pull down at the top of a page to reload it, and read something while it
 * happens.
 *
 * The fact is fetched on the pull rather than on page load, deliberately:
 * every fact handed out is recorded as seen so it is not repeated, and
 * prefetching one on every render would burn through the library showing her
 * nothing. Pulling is the moment she has actually asked for something to read.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [fact, setFact] = useState<Fact | null>(null);
  // Kept in state, not a ref: the transition depends on it at render time,
  // and reading a ref there is exactly what React 19 forbids.
  const [dragging, setDragging] = useState(false);

  const startY = useRef<number | null>(null);
  const asked = useRef(false);
  const active = useRef(false);

  const loadFact = useCallback(async () => {
    if (asked.current) return;
    asked.current = true;
    try {
      setFact(await action<Fact>("get_fact"));
    } catch {
      // A missing fact is not a reason to break the gesture — the pull still
      // reloads, it just does it quietly.
    }
  }, []);

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
      if (distance > 24) void loadFact();
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
          window.setTimeout(() => {
            setRefreshing(false);
            setFact(null);
            asked.current = false;
          }, 700);
          return THRESHOLD;
        }
        asked.current = false;
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
  }, [loadFact, refreshing, router]);

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
          {fact ? (
            <>
              <p className="text-[10px] uppercase tracking-wide text-accent">
                {refreshing ? "Refreshing" : ready ? "Let go to refresh" : "Did you know"}
              </p>
              <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-muted">{fact.fact}</p>
            </>
          ) : (
            <p className="text-[11px] text-faint">
              {refreshing ? "Refreshing…" : ready ? "Let go to refresh" : "Pull to refresh"}
            </p>
          )}
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
