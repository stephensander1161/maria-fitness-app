"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * "I ate the plan" — the whole day, in one tap.
 *
 * The plan already holds a title, calories and every macro for each meal, and
 * on a day she stuck to it she was retyping all of that into the calculator
 * four times. The data is right there; this copies it across.
 *
 * It only ever logs what is *not already down*, so tapping it after logging
 * breakfast by hand adds lunch and dinner rather than a second breakfast, and
 * tapping it twice does nothing the second time. The tool holds that as well,
 * with one key per planned meal per day — a double tap on a slow connection
 * must not be able to log the day twice.
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

  // Nothing left to log is not a hidden button — a control that vanishes reads
  // as broken. It says why it has nothing to do.
  if (remaining === 0) {
    return (
      <p className="mt-3 border-t border-line/60 pt-3 text-[12px] text-faint">
        {done !== null ? `Logged ${done}. ` : ""}
        {skipped.length > 0
          // Named, never silent: a meal it decided not to log is exactly the
          // thing she would otherwise notice as missing an hour later.
          ? `Left your own ${skipped.join(", ")} alone — there was already something in.`
          : "Every meal planned for this day is already in your log."}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-line/60 pt-3">
      <button
        onClick={log}
        disabled={busy}
        className="w-full rounded-lg border border-edge py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-raised active:bg-raised disabled:opacity-40"
      >
        {busy
          ? "Logging…"
          : `Ate ${remaining === 1 ? "it" : "all of this"} — log ${remaining} meal${remaining === 1 ? "" : "s"}`}
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
        Copies the planned figures into your log and takes the ingredients out of your kitchen.
        Anything you have already logged is left alone.
      </p>
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
    </div>
  );
}
