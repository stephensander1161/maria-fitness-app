"use client";

import { useEffect, useRef } from "react";
import { ExerciseFigure } from "./exercise-figure";

/**
 * Rest is over. Say so like it matters.
 *
 * The bar at the bottom of the screen was doing this job by going green, which
 * is easy to miss with a phone face-down on a bench. This takes the whole
 * screen for a moment: the frame lights up like a fuse burning round the edge,
 * the word lands, and it goes away the instant she touches anything.
 *
 * It stays until she puts it away. A timeout was wrong for the one case this
 * exists for — the phone face-down on a bench while she racks a weight. Coming
 * back to a screen that had already given up is exactly the miss it is meant
 * to prevent. Any tap or any key clears it, and there is nothing to find: the
 * whole screen is the dismiss target.
 */
export function GoScreen({
  name, slug, category, onDismiss,
}: {
  name: string;
  slug: string;
  category: string;
  onDismiss: () => void;
}) {
  const dismissed = useRef(false);

  useEffect(() => {
    const go = () => {
      if (dismissed.current) return;
      dismissed.current = true;
      onDismiss();
    };
    window.addEventListener("keydown", go);
    window.addEventListener("pointerdown", go);
    return () => {
      window.removeEventListener("keydown", go);
      window.removeEventListener("pointerdown", go);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="assertive"
      onClick={onDismiss}
      className="fixed inset-0 z-[90] grid place-items-center bg-ink/92 backdrop-blur-sm"
    >
      {/* The fuse: four segments, each running its own leg of the lap. A
          border cannot be drawn progressively, so this is four bars. */}
      <span aria-hidden className="go-top absolute left-0 top-0 h-[3px] w-full bg-accent" />
      <span aria-hidden className="go-right absolute right-0 top-0 h-full w-[3px] bg-accent" />
      <span aria-hidden className="go-bottom absolute bottom-0 left-0 h-[3px] w-full bg-accent" />
      <span aria-hidden className="go-left absolute bottom-0 left-0 h-full w-[3px] bg-accent" />

      {/* A glow inside the frame, so the edge reads as burning rather than drawn. */}
      <span
        aria-hidden
        className="go-glow pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 90px 10px color-mix(in srgb, var(--color-accent) 45%, transparent)" }}
      />

      <div className="relative px-8 text-center">
        <ExerciseFigure
          slug={slug}
          category={category}
          className="go-word mx-auto mb-4 h-28 w-28 text-accent"
        />
        <p className="go-word text-[clamp(3rem,18vw,7rem)] font-bold leading-none tracking-tight text-accent">
          GO
        </p>
        <p className="go-sub mt-3 text-[15px] font-medium text-text">{name}</p>
        <p className="go-sub mt-1 text-[12px] text-faint">Tap anywhere to clear</p>
      </div>
    </div>
  );
}
