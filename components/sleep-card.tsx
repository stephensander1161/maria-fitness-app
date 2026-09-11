"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { NumberField } from "./number-field";
import { line } from "@/lib/voice";
import type { Tone } from "@/lib/buddy";

/**
 * Last night, and the way to write it down.
 *
 * Sleep gets the same treatment as the weigh-in because it earns it: it moves
 * appetite, grip strength and how hard a set feels by more than most of what
 * this screen already tracks, and the app used to be silent about it — so a
 * fortnight of five-hour nights read as her losing interest.
 *
 * The two rules are the weigh-in's rules:
 *
 * 1. **Praise the act, not the number.** The line for logging is about
 *    logging. An app that congratulates eight hours is an app that tells you
 *    off for five, and nobody chooses a bad night.
 * 2. **A short night is information, not a verdict.** It says what it will
 *    feel like, and never what she should have done. She was there.
 */
type Logged = {
  slept: string;
  date: string;
  target: string;
  state: "short" | "under" | "there" | "long" | "unknown";
};

const QUALITY = ["Rough", "Poor", "OK", "Good", "Great"];

export function SleepCard({
  lastNight, target, quality: loggedQuality, tone, date, nightLabel = "Last night",
}: {
  /** The morning this is filed under — the day on screen, not today's. */
  date?: string;
  /** What to call that night. "Last night" only reads right on today. */
  nightLabel?: string;
  /** The register she picked — see lib/voice.ts. */
  tone: Tone | null;
  /** What she slept, already formatted — "7h 30m" — or null for not logged. */
  lastNight: string | null;
  target: string;
  quality: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(7.5);
  const [quality, setQuality] = useState<number | null>(loggedQuality);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Logged | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await action<Logged>("log_sleep", {
        howLong: `${hours}h`,
        ...(quality === null ? {} : { quality }),
        ...(date ? { date } : {}),
      });
      setOpen(false);
      setDone(r);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — check your signal and try again."));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const said = line("sleepLogged", tone, String(hours));
    // Short nights get a plain surface rather than the celebratory one. Not a
    // warning colour: she did not do anything wrong, and a red card for a bad
    // night is the app telling her off for the baby waking up.
    const warm = done.state !== "short";
    return (
      <section className={`card mb-3 p-5 text-center ${warm ? "border-beat/40 bg-beat-soft" : ""}`}>
        <p className={`text-[28px] font-bold tabular leading-none ${warm ? "text-beat" : "text-text"}`}>
          {done.slept}
        </p>
        <p className="mt-2 text-[13px] text-text">{said}</p>
        <p className="mt-1 text-[12px] text-muted tabular">target {done.target}</p>
        {done.state === "short" && (
          <p className="mx-auto mt-3 max-w-xs border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
            Under seven hours. If today&rsquo;s session feels heavier than the
            numbers say it should, that is why — it is not you going backwards.
          </p>
        )}
        <button
          onClick={() => { setDone(null); setOpen(true); }}
          className="mt-3 text-[12px] text-faint underline underline-offset-2 hover:text-muted"
        >
          Change it
        </button>
      </section>
    );
  }

  if (!open) {
    if (lastNight !== null) {
      return (
        <section className="card mb-3 flex items-center gap-3 p-3 pl-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-faint">{nightLabel}</p>
            <p className="text-[13px] text-muted tabular">
              {lastNight}
              {loggedQuality !== null && ` · ${QUALITY[loggedQuality - 1]}`}
              <span className="text-faint"> · target {target}</span>
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
      <section className="card mb-3 flex items-center gap-3 border-accent/50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-accent">{nightLabel}</p>
          <p className="text-[13px] text-muted">No sleep logged — it takes five seconds.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent active:opacity-80"
        >
          Log sleep
        </button>
      </section>
    );
  }

  return (
    <section className="card mb-3 space-y-3 p-3">
      <NumberField
        value={hours}
        onChange={setHours}
        step={0.25}
        min={1}
        max={16}
        decimals
        suffix="hours"
        label="Slept"
      />
      <div>
        <p className="mb-1.5 px-1 text-[11px] uppercase tracking-wide text-faint">
          How was it? <span className="normal-case tracking-normal">(optional)</span>
        </p>
        {/* Optional and clearable, because a night she did not rate is not a
            night she rated badly — the column is nullable for the same reason. */}
        <div className="grid grid-cols-5 gap-1.5">
          {QUALITY.map((word, i) => {
            const value = i + 1;
            const on = quality === value;
            return (
              <button
                key={word}
                type="button"
                aria-pressed={on}
                onClick={() => setQuality(on ? null : value)}
                className={`rounded-xl border py-2.5 text-[12px] font-semibold ${
                  on ? "border-accent bg-accent text-on-accent" : "border-edge text-muted active:bg-line"
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setOpen(false); setError(null); }}
          className="rounded-xl border border-line py-3 text-[14px] text-muted">Cancel</button>
        <button onClick={save} disabled={saving}
          className="rounded-xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
    </section>
  );
}
