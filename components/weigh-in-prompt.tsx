"use client";

import { startTransition, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isChromeless } from "@/lib/chromeless";
import { action, actionMessage } from "@/lib/client";
import { useDialog } from "@/lib/use-dialog";
import { NumberField } from "./number-field";
import { DISMISS_KEY } from "@/lib/morning-weigh-in";

/**
 * Good morning. Step on the scale — and how did you sleep?
 *
 * The weigh-in lived on Progress, two taps away and behind a screen about
 * last week, so the number that every target, every trend and every milestone
 * is computed from got logged when she happened to remember. This asks once,
 * on the first open of the day, and then never again until tomorrow.
 *
 * Last night rides along with it, because it is the same kind of question and
 * the same moment is the only one she is certain of the answer in. By the
 * evening "about seven, I think" is the best anybody can do, and the sleep
 * card on Progress was being answered at four in the afternoon or not at all.
 *
 * Two rules for the sleep half, and the first is the one this app repeats:
 *
 * 1. **Nothing is logged unless she says it.** The hours start blank rather
 *    than at a plausible 7.5, and no sleep row is written unless she fills
 *    them in. A seeded default saved as fact is an invented night, and the
 *    trend it feeds would be inventing the thing it exists to measure.
 * 2. **It never blocks the weight.** It is the second question on a screen
 *    about the first, so leaving it alone costs nothing and answering it
 *    badly cannot stop the weigh-in going in.
 *
 * Full screen on purpose, the same way the rest alarm is: one moment with two
 * answers, and a card competing with six others is how it ended up being
 * skipped for a fortnight. "Not today" is the same size as the rest, because
 * a prompt you cannot easily refuse is one people learn to dread.
 */
/** 1 terrible to 5 excellent, in her words. The same five as the sleep card. */
const QUALITY = ["Rough", "Poor", "OK", "Good", "Great"];

export function WeighInPrompt({
  seed, unit, today, name, askSleep = false,
}: {
  /** Her last known weight, in display units. The scale rarely moves far. */
  seed: number | null;
  unit: string;
  today: string;
  name: string | null;
  /** Last night is not logged yet, so ask about it here too. */
  askSleep?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const [gone, setGone] = useState(true);
  const [value, setValue] = useState(seed ?? 150);
  /*
    Blank, not 7.5.

    Unknown is not zero — the rule this codebase has been caught by four
    times. A seeded number in this box is a suggestion she has to clear, and
    one she taps past becomes a night that never happened, sitting in the
    average alongside the real ones.
  */
  const [hours, setHours] = useState(0);
  const [quality, setQuality] = useState<number | null>(null);
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

  /** She has actually answered the sleep question. */
  const sleepGiven = askSleep && hours > 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await action("log_weight", { weight: value });
      /*
        Second, and separately.

        The weight is the question this screen is for, and it is already
        written by the time this runs: a sleep row that will not save must not
        take the weigh-in down with it. Both tools upsert on (profile, date),
        so tapping again after a failure corrects rather than doubles.
      */
      if (sleepGiven) {
        await action("log_sleep", {
          howLong: `${hours}h`,
          ...(quality === null ? {} : { quality }),
        });
      }
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
    /*
      Scrolls rather than centres blindly.

      With the sleep question under it this is two fields, a row of five
      buttons and two full-width controls, which is taller than a small phone
      once the keyboard is up. `place-items-center` in a grid clips the *top*
      when the content is taller than the box — the one part that cannot be
      reached by scrolling — so it is a min-height flex column instead: still
      centred when there is room, still readable when there is not.
    */
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-ink"
      role="dialog"
      aria-modal="true"
      aria-label={askSleep ? "Log this morning's weight and last night's sleep" : "Log this morning's weight"}
    >
      <div className="flex min-h-full items-center justify-center p-6">
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

        {askSleep && (
          /*
            The morning's other question.

            Under a rule rather than in a card of its own: it is the same
            moment and the same kind of answer, and a second panel would make
            this read as two screens stacked — which is how it would come to
            be dismissed.
          */
          <div className="mt-6 border-t border-line pt-5 text-left">
            <p className="text-center text-[15px] font-semibold">And how did you sleep?</p>
            <div className="mt-4">
              <NumberField
                label="Slept (hours)"
                value={hours}
                step={0.25}
                decimals
                min={0}
                max={16}
                blankAtZero
                placeholder="—"
                onChange={setHours}
              />
            </div>
            <p className="mb-1.5 mt-4 px-1 text-[11px] uppercase tracking-wide text-faint">
              How was it? <span className="normal-case tracking-normal">(optional)</span>
            </p>
            {/* Optional and clearable: a night she did not rate is not a night
                she rated badly, which is why the column is nullable. */}
            <div className="grid grid-cols-5 gap-1.5">
              {QUALITY.map((word, i) => {
                const n = i + 1;
                const on = quality === n;
                return (
                  <button
                    key={word}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setQuality(on ? null : n)}
                    className={`rounded-xl border py-2.5 text-[12px] font-semibold ${
                      on ? "border-accent bg-accent text-on-accent" : "border-edge text-muted active:bg-line"
                    }`}
                  >
                    {word}
                  </button>
                );
              })}
            </div>
            {/* A rating with no length behind it cannot be filed — `log_sleep`
                is a duration with a rating on it, not the other way round. Said
                plainly and in passing, rather than as an error when she taps
                Log: she has not done anything wrong yet. */}
            {quality !== null && hours === 0 && (
              <p className="mt-2 px-1 text-[12px] leading-relaxed text-muted">
                Add how long and it goes in with the rating.
              </p>
            )}
          </div>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent active:opacity-80 disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : sleepGiven
              ? `Log ${value} ${unit} and ${hours}h`
              : `Log ${value} ${unit}`}
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
    </div>
  );
}
