"use client";

import { startTransition, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isChromeless } from "@/lib/chromeless";
import { action, actionMessage } from "@/lib/client";
import { useDialog } from "@/lib/use-dialog";
import { NumberField } from "./number-field";
import { DISMISS_KEY } from "@/lib/morning-weigh-in";

/**
 * Good morning. Step on the scale.
 *
 * The weigh-in lived on Progress, two taps away and behind a screen about
 * last week, so the number that every target, every trend and every milestone
 * is computed from got logged when she happened to remember. This asks once,
 * on the first open of the day, and then never again until tomorrow.
 *
 * Full screen on purpose, the same way the rest alarm is: it is one question
 * with one answer, and a card competing with six others is how it ended up
 * being skipped for a fortnight. "Not today" is the same size as the number,
 * because a prompt you cannot easily refuse is one people learn to dread.
 */
export function WeighInPrompt({
  seed, unit, today, name,
}: {
  /** Her last known weight, in display units. The scale rarely moves far. */
  seed: number | null;
  unit: string;
  today: string;
  name: string | null;
}) {
  const router = useRouter();
  const path = usePathname();
  const [gone, setGone] = useState(true);
  const [value, setValue] = useState(seed ?? 150);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useDialog(() => skip());

  /**
   * Whether she has already waved this away today, from this browser.
   *
   * Read after mount rather than during render: the server cannot know what
   * this browser remembers, and rendering it open and then closing it is a
   * flash of a full-screen prompt on every navigation. It starts hidden and
   * appears only once the answer is known.
   */
  useEffect(() => {
    // On the next frame, not synchronously: setting state inside the first
    // effect pass is a cascading render, and the lint rule is right about it.
    const id = window.requestAnimationFrame(() => {
      let skipped: string | null = null;
      try { skipped = window.localStorage.getItem(DISMISS_KEY); } catch { /* private mode */ }
      if (skipped !== today) setGone(false);
    });
    return () => window.cancelAnimationFrame(id);
  }, [today]);

  function skip() {
    try { window.localStorage.setItem(DISMISS_KEY, today); } catch { /* fine */ }
    setGone(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await action("log_weight", { weight: value });
      // Not "dismissed": she answered it. The row is what stops it coming
      // back, on this device and on every other one.
      setGone(true);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — check your signal and try again."));
    } finally {
      setSaving(false);
    }
  }

  // Not over the sign-in door or anything else without the app's chrome.
  if (gone || isChromeless(path)) return null;

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-ink p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Log this morning's weight"
    >
      <div ref={panel} className="w-full max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
          Good morning{name ? `, ${name}` : ""}
        </p>
        <h2 className="mt-2 text-[26px] font-bold leading-tight">
          What does the scale say?
        </h2>
        {/* Said once, here, because it is the reason to bother: one reading is
            not progress and she has been told that everywhere else. The point
            of doing it daily is that the trend can then answer at all. */}
        <p className="mx-auto mt-2 max-w-[17rem] text-[13px] leading-relaxed text-muted">
          One morning is never progress. Enough of them in a row is what lets
          the trend say which way you&rsquo;re going.
        </p>

        <div className="mt-6">
          <NumberField
            label={`Weight (${unit})`}
            value={value}
            step={0.2}
            decimals
            min={0}
            max={2000}
            onChange={setValue}
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent active:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving…" : `Log ${value} ${unit}`}
        </button>
        {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}

        {/* The same size as the other one. A prompt you cannot easily refuse
            is one people learn to dread, and this one arrives every morning. */}
        <button
          onClick={skip}
          className="mt-3 w-full rounded-xl border border-line py-3 text-[14px] text-muted active:bg-raised"
        >
          Not today
        </button>
      </div>
    </div>
  );
}
