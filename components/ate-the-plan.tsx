"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * "Ate all of it" — a link, not a card.
 *
 * It was a full-width button with a paragraph under it explaining what it was
 * about to do, for a day with three meals on it where tapping each row's own
 * "Ate it" is three taps. A control that costs more screen than the work it
 * saves is a control in the way, so this is one small line at the end of the
 * list and nothing else.
 *
 * It still only logs what is *not already down*: tapping it after logging
 * breakfast by hand adds lunch and dinner rather than a second breakfast, and
 * the tool holds that too, with one key per planned meal per day so a double
 * tap on a slow connection cannot log the day twice.
 */
export function AteThePlan({ date, remaining }: { date: string; remaining: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  async function log() {
    setBusy(true);
    setError(null);
    try {
      const r = await action<{ logged: { title: string }[]; skipped: string[] }>(
        "log_planned_day", { date },
      );
      setDone(r.logged.length);
      setSkipped(r.skipped ?? []);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "Couldn't log those — try again."));
    } finally {
      setBusy(false);
    }
  }

  // Nothing left to log, nothing to draw. The row's own ticks already say
  // which meals are down, so a line here saying it again is noise.
  if (remaining === 0) {
    return done !== null || skipped.length > 0 ? (
      <p className="mt-2 text-right text-[11px] text-faint">
        {done ? `Logged ${done}.` : ""}
        {skipped.length > 0 ? ` Left your own ${skipped.join(", ")} alone.` : ""}
      </p>
    ) : null;
  }

  return (
    <div className="mt-2 text-right">
      <button
        onClick={log}
        disabled={busy}
        className="rounded-full px-1 py-1 text-[11px] font-medium text-accent underline underline-offset-2 disabled:opacity-40"
      >
        {busy ? "Logging\u2026" : `Ate all ${remaining}`}
      </button>
      {error && <p role="alert" className="mt-1 text-[11px] text-miss">{error}</p>}
    </div>
  );
}
