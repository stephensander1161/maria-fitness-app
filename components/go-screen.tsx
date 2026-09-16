"use client";

import { useEffect, useRef, useState } from "react";
import { ExerciseFigure } from "./exercise-figure";
import { NumberField } from "./number-field";
import { actionMessage } from "@/lib/client";
import { describeSet } from "@/lib/holds";
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
export type GoSet = { reps?: number; holdSeconds?: number; weight: number | null; rir?: number };

export function GoScreen({
  rest, pair = null, onLog, onDismiss,
}: {
  rest: Rest;
  /**
   * The other half of a superset, on the same screen.

   * A superset was two GO screens in a row — one per movement, with a
   * hand-off between them that replaced the rest under a component that was
   * never remounted, so the second screen opened with the first movement's
   * numbers in its fields and its button stuck on "Logging…". "it's 2
   * separate screens which is annoying and also after I log one the second
   * screen appears but I can't log." Both halves are one screen now, one
   * button, logged together: that is what a superset *is*.
   */
  pair?: Rest | null;
  /** Log the set she just did — and its partner, on a superset — and start the next rest. */
  onLog: (set: GoSet, pairSet?: GoSet) => Promise<void>;
  onDismiss: () => void;
}) {
  const { name, slug, category } = rest;
  const held = rest.isHold === true;
  const [reps, setReps] = useState(rest.reps);
  const [weight, setWeight] = useState(rest.weight ?? 0);
  const pairHeld = pair?.isHold === true;
  const [reps2, setReps2] = useState(pair?.reps ?? 0);
  const [weight2, setWeight2] = useState(pair?.weight ?? 0);
  const [busy, setBusy] = useState(false);
  /** Chosen, not sent — see the card. Null is "she did not say". */
  const [rir, setRir] = useState<number | null>(null);
  const [rir2, setRir2] = useState<number | null>(null);
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

  async function log(rir?: number) {
    setBusy(true);
    setError(null);
    try {
      // Seconds for a hold, reps for everything else. The tool refuses the
      // wrong one rather than quietly recording a number that means nothing.
      await onLog({
        ...(held ? { holdSeconds: reps } : { reps }),
        weight: rest.loadable && weight > 0 ? weight : null,
        ...(rir === undefined ? {} : { rir }),
      }, pair ? {
        ...(pairHeld ? { holdSeconds: reps2 } : { reps: reps2 }),
        weight: pair.loadable && weight2 > 0 ? weight2 : null,
        ...(rir2 === null ? {} : { rir: rir2 }),
      } : undefined);
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
          What she has to beat, in the size it deserves.

          "on the go screen lets display the set/reps to beat (from last
          session) somewhere big and bold so that we know how hard we have to
          go when we see the GO." It is the one number that decides how the
          next ninety seconds go, and until now the screen only offered a field
          seeded with what she had just done — which answers "what did I do",
          not "what do I have to do".

          Nothing at all when last session has no set in this position: she is
          doing more sets than she did before, and an empty space says that
          honestly where a "0" would read as a target.
        */}
        {rest.toBeat && (
          <p className="go-sub mt-4">
            <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
              To beat
            </span>
            <span className="mt-0.5 block text-[clamp(1.75rem,9vw,2.75rem)] font-bold leading-none tabular text-text">
              {describeSet(rest.toBeat, held)}
              {rest.loadable && rest.toBeat.weight !== null && (
                <span className="ml-1 align-baseline text-[0.5em] font-semibold text-faint">{rest.unit}</span>
              )}
            </span>
          </p>
        )}

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
              label={held ? "Seconds" : "Reps"}
              value={reps}
              onChange={setReps}
              step={held ? 5 : 1}
              decimals={!held}
              min={held ? 5 : 0.5}
              max={held ? 900 : 500}
            />
          </div>

          {/* The same question the card asks, in the same words. It is the
              only fatigue signal this app has, and the GO screen is where she
              is most likely to know the answer — she has just put the weight
              down. Skipping it is fine: unknown is not zero, and zero here
              means she went to failure. */}
          {!held && (
            <div className="flex items-center gap-1.5">
              <span className="mr-0.5 shrink-0 text-[11px] uppercase tracking-wide text-faint">
                Left in tank
              </span>
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setRir(rir === n ? null : n)}
                  disabled={busy}
                  aria-pressed={rir === n}
                  aria-label={`${n === 3 ? "3 or more" : n} reps left in the tank`}
                  className={`min-w-11 flex-1 rounded-lg border py-2.5 text-[13px] active:bg-raised disabled:opacity-40 ${
                    rir === n ? "border-accent bg-accent-soft text-accent" : "border-edge text-muted"
                  }`}
                >
                  {n === 3 ? "3+" : n}
                </button>
              ))}
            </div>
          )}

          {pair && (
            <div className="border-t border-line pt-3">
              <p className="text-[13px] font-medium text-text">
                <span className="mr-1.5 text-[11px] uppercase tracking-wide text-faint">then</span>
                {pair.name}
              </p>
              {pair.toBeat && (
                <p className="mt-1 text-[12px] text-faint tabular">
                  To beat {describeSet(pair.toBeat, pairHeld)}{pair.loadable && pair.toBeat.weight !== null ? ` ${pair.unit}` : ""}
                </p>
              )}
              <div className={`mt-2 grid gap-2 ${pair.loadable ? "grid-cols-2" : "grid-cols-1"}`}>
                {pair.loadable && (
                  <NumberField
                    label={`Weight (${pair.unit})`}
                    value={weight2}
                    onChange={setWeight2}
                    step={weight2 >= 100 ? 5 : weight2 >= 20 ? 2.5 : 1}
                    min={0}
                    max={2000}
                    decimals
                  />
                )}
                <NumberField
                  label={pairHeld ? "Seconds" : "Reps"}
                  value={reps2}
                  onChange={setReps2}
                  step={pairHeld ? 5 : 1}
                  decimals={!pairHeld}
                  min={pairHeld ? 5 : 0.5}
                  max={pairHeld ? 900 : 500}
                />
              </div>
              {!pairHeld && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="mr-0.5 shrink-0 text-[11px] uppercase tracking-wide text-faint">
                    Left in tank
                  </span>
                  {[0, 1, 2, 3].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRir2(rir2 === n ? null : n)}
                      disabled={busy}
                      aria-pressed={rir2 === n}
                      aria-label={`${n === 3 ? "3 or more" : n} reps left in the tank on ${pair.name}`}
                      className={`min-w-11 flex-1 rounded-lg border py-2.5 text-[13px] active:bg-raised disabled:opacity-40 ${
                        rir2 === n ? "border-accent bg-accent-soft text-accent" : "border-edge text-muted"
                      }`}
                    >
                      {n === 3 ? "3+" : n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-[12px] text-miss">{error}</p>}

          <button
            onClick={() => void log(rir ?? undefined)}
            disabled={busy}
            className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-50"
          >
            {busy ? "Logging…" : pair ? "Log both and rest" : "Log it and rest"}
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
