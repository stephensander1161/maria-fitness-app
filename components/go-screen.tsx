"use client";

import { useEffect, useRef, useState } from "react";
import { ExerciseFigure } from "./exercise-figure";
import { NumberField } from "./number-field";
import { actionMessage } from "@/lib/client";
import type { Rest } from "./rest-timer";

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
 * to prevent.
 *
 * It also takes the set. She is standing at the rack having just finished
 * one; the numbers are in her head at that moment and nowhere else five
 * minutes later, and logging them here is what starts the next rest. That is
 * the whole loop — alarm, lift, type two numbers, rest again — with no trip
 * back to the card in the middle of it.
 */
export function GoScreen({
  rest, onLog, onDismiss,
}: {
  rest: Rest;
  /** Log the set she just did and start the next rest. */
  onLog: (set: { reps: number; weight: number | null }) => Promise<void>;
  onDismiss: () => void;
}) {
  const { name, slug, category } = rest;
  const [reps, setReps] = useState(rest.reps);
  const [weight, setWeight] = useState(rest.weight ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    // Escape only. It used to clear on any tap or key, which cannot coexist
    // with a form: every tap on the stepper would have closed the screen the
    // stepper is on.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || dismissed.current) return;
      dismissed.current = true;
      onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  async function log() {
    setBusy(true);
    setError(null);
    try {
      await onLog({ reps, weight: rest.loadable && weight > 0 ? weight : null });
    } catch (err) {
      setError(actionMessage(err, "That didn't log — try again."));
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-ink/92 backdrop-blur-sm"
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

      <div className="relative w-full max-w-xs px-6 py-8 text-center">
        <ExerciseFigure
          slug={slug}
          category={category}
          className="go-word mx-auto mb-3 h-20 w-20 text-accent"
        />
        <p className="go-word text-[clamp(2.5rem,14vw,5rem)] font-bold leading-none tracking-tight text-accent">
          GO
        </p>
        <p className="go-sub mt-2 text-[15px] font-medium text-text">{name}</p>

        {/*
          The set goes in here, not in a panel she has to find afterwards.
          She is standing at the rack having just finished one: the numbers
          are in her head now, and logging them is what starts the next rest.
        */}
        <div className="go-sub mt-6 space-y-2 text-left">
          <div className={`grid gap-2 ${rest.loadable ? "grid-cols-2" : "grid-cols-1"}`}>
            {rest.loadable && (
              <NumberField
                label={`Weight (${rest.unit})`}
                value={weight}
                onChange={setWeight}
                step={weight >= 100 ? 5 : weight >= 20 ? 2.5 : 1}
                min={0}
                max={2000}
                decimals
              />
            )}
            <NumberField
              label="Reps"
              value={reps}
              onChange={setReps}
              step={1}
              decimals
              min={0.5}
              max={500}
            />
          </div>

          {error && <p role="alert" className="text-[12px] text-miss">{error}</p>}

          <button
            onClick={log}
            disabled={busy}
            className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-ink disabled:opacity-50"
          >
            {busy ? "Logging…" : "Log it and rest"}
          </button>
          <button
            onClick={onDismiss}
            className="w-full py-2 text-[12px] text-faint hover:text-muted"
          >
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}
