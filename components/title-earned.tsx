"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";

/**
 * A new rank, said properly.
 *
 * The title was already the one thing on this app that says something about
 * *her* rather than about the app, and it changed in silence — the greeting
 * bar simply read something different one morning and she was never told why.
 * Earning it is the only moment it means anything, so it gets the same
 * treatment as finishing a session.
 *
 * Two things it is careful about:
 *
 * - **It queues behind the session-done screen.** Crossing a rank usually
 *   happens *because* she just finished a session, so both want the screen at
 *   once. This waits for the other one to clear rather than stacking two
 *   full-screen takeovers, which would mean she sees neither.
 * - **It is about turning up, never about her body.** That is the rule the
 *   ranks are written to and this only repeats what the library says.
 */
export function TitleEarned({
  name, blurb, number, of,
}: { name: string; blurb: string; number: number; of: number }) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  const closed = useRef(false);

  /*
    Queued behind the session summary in CSS, not in JavaScript.

    Crossing a rank usually happens *because* she just finished a session, so
    both want the screen at the same moment. A `:has()` rule keeps this one
    display:none until the other clears — which also means the tap that
    dismisses the summary cannot land on this, because a hidden element takes
    no pointer events. Polling for the other screen in an effect would have
    meant setting state from inside one, and the compiler is right to refuse
    that.
  */
  useEffect(() => {
    if (gone) return;
    const go = () => {
      if (closed.current) return;
      closed.current = true;
      setGone(true);
      // Best effort: if the write fails she is told once more, which is a much
      // better failure than never being told at all.
      void action("acknowledge_title", {}).catch(() => { /* see above */ });
      startTransition(() => router.refresh());
    };
    // A beat before it will take a tap, so the tap that finished her last set
    // does not also clear the thing that set just earned her.
    const arm = window.setTimeout(() => {
      window.addEventListener("keydown", go);
      window.addEventListener("pointerdown", go);
    }, 600);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("keydown", go);
      window.removeEventListener("pointerdown", go);
    };
  }, [gone, router]);

  if (gone) return null;

  return (
    <div
      data-celebration="title"
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[95] grid place-items-center bg-ink/92 px-6 backdrop-blur-sm"
    >
      <span aria-hidden className="go-top absolute left-0 top-0 h-[3px] w-full bg-accent" />
      <span aria-hidden className="go-right absolute right-0 top-0 h-full w-[3px] bg-accent" />
      <span aria-hidden className="go-bottom absolute bottom-0 left-0 h-[3px] w-full bg-accent" />
      <span aria-hidden className="go-left absolute bottom-0 left-0 h-full w-[3px] bg-accent" />
      <span
        aria-hidden
        className="go-glow pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 90px 10px color-mix(in srgb, var(--color-accent) 40%, transparent)" }}
      />

      <div className="relative w-full max-w-sm text-center">
        <p className="go-sub text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
          New title
        </p>
        <p className="go-word mt-3 text-[clamp(1.8rem,9vw,3.2rem)] font-bold leading-[1.05] tracking-tight text-accent">
          {name}
        </p>
        <p className="go-sub mt-4 text-[14px] leading-relaxed text-muted">{blurb}</p>

        {/* Where it sits, because "rank 12 of 30" is the part that says there
            is more of this and she is getting somewhere. */}
        <p className="go-sub mt-7 inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-4 py-2 text-[12px] text-faint">
          <span className="tabular text-text">{number}</span>
          <span>of {of}</span>
        </p>

        <p className="go-sub mt-8 text-[12px] text-faint">Tap anywhere to clear</p>
      </div>
    </div>
  );
}
