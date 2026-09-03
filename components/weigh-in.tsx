"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { NumberField } from "./number-field";

/**
 * The first thing on the Progress screen, and on a day she has not weighed in,
 * the loudest.
 *
 * It was a grey row with a button, which is what an app asks of you when it
 * does not much mind whether you do it. Weighing in is the one input the whole
 * expenditure model runs on, and it takes ten seconds, so on a day she hasn't
 * it opens with the stepper already out and says what it is for.
 *
 * What it says back matters more than how it looks. Two rules:
 *
 * 1. **Never call one morning progress.** A day's weight moves on water, food
 *    and where she is in her cycle; `changeSinceLast` exists in the tool's
 *    result and is deliberately not shown. Since-start is a real span and is.
 * 2. **Praise the act, not the number.** The line she gets for logging is
 *    about logging. A scale that congratulates you for being lighter is a
 *    scale that tells you off for being heavier, and this app does not do
 *    that in either direction.
 */
type Logged = {
  logged: { date: string; weight: number; unit: string };
  changeSinceStart: number | null;
  remainingToGoal: number | null;
};

/** Rotated so the fiftieth weigh-in does not read exactly like the first. */
const LINES = [
  "Another dot on the line.",
  "That's the data. The trend does the talking.",
  "Logged. Ten seconds well spent.",
  "In it goes.",
  "Noted. The line gets steadier every time you do this.",
  "One more reading the trend can lean on.",
];

export function WeighIn({
  current, unit, loggedToday,
}: {
  current: number | null;
  unit: string;
  loggedToday: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? 150);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Logged | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await action<Logged>("log_weight", { weight: value });
      setOpen(false);
      setDone(r);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — check your signal and try again."));
    } finally {
      setSaving(false);
    }
  }

  // Just weighed in: say something, then get out of the way. The card returns
  // to its quiet state on the next page load.
  if (done) {
    const line = LINES[Math.floor(Math.abs(done.logged.weight * 10)) % LINES.length];
    return (
      <section className="card mb-3 border-beat/40 bg-beat-soft p-5 text-center">
        <p className="text-[28px] font-bold tabular leading-none text-beat">
          {done.logged.weight}
          <span className="ml-1 text-[15px] font-medium">{done.logged.unit}</span>
        </p>
        <p className="mt-2 text-[13px] text-text">{line}</p>
        {/* A span long enough to mean something. Today against yesterday is
            not, and is the one comparison never shown here. */}
        {done.changeSinceStart !== null && done.changeSinceStart !== 0 && (
          <p className="mt-1 text-[12px] text-muted tabular">
            {done.changeSinceStart < 0 ? "−" : "+"}
            {Math.abs(done.changeSinceStart)}{done.logged.unit} since you started
          </p>
        )}
        {/* It said "Change it" and then dropped back to the quiet row, which
            reads as a button that did nothing. It opens the stepper. */}
        <button
          onClick={() => { setValue(done.logged.weight); setDone(null); setOpen(true); }}
          className="mt-3 text-[12px] text-faint underline underline-offset-2 hover:text-muted"
        >
          Change it
        </button>
      </section>
    );
  }

  if (!open) {
    // Done for today: a quiet row. Not done: the thing on the screen.
    if (loggedToday) {
      return (
        <section className="card mb-3 flex items-center gap-3 p-3 pl-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-faint">Today</p>
            <p className="text-[13px] text-muted tabular">
              {current !== null ? `Weighed in at ${current} ${unit}` : "Weighed in"}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-xl border border-line bg-raised px-4 py-2.5 text-[14px] font-semibold text-muted active:bg-line"
          >
            Update
          </button>
        </section>
      );
    }

    return (
      <section className="card mb-3 border-accent/50 p-5">
        <p className="text-[11px] uppercase tracking-wide text-accent">Today</p>
        <h2 className="mt-0.5 text-[17px] font-semibold">Step on the scale</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Ten seconds. It is the one number the whole plan is worked out from — and no single
          reading is judged, so an odd morning costs you nothing.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-ink active:opacity-80"
        >
          Weigh in
        </button>
      </section>
    );
  }

  return (
    <section className="card mb-3 space-y-3 p-3">
      <NumberField
        value={value}
        onChange={setValue}
        step={0.2}
        min={30}
        max={700}
        decimals
        suffix={unit}
        label="Weight"
      />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setOpen(false); setError(null); }}
          className="rounded-xl border border-line py-3 text-[14px] text-muted">Cancel</button>
        <button onClick={save} disabled={saving}
          className="rounded-xl bg-accent py-3 text-[14px] font-semibold text-ink disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
    </section>
  );
}
