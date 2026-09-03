"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import type { Allowance } from "@/lib/allowance";

export type Usage = Allowance;

/** What she is allowed to keep for herself. 100 is a full day. */
const CAPS = [25, 50, 75, 100];

/**
 * How much of today's coach she has used, and how much of a day she wants to
 * allow herself.
 *
 * Deliberately not money. This used to read "31¢ of 50¢", which turned every
 * question into a purchase decision — she would think twice before asking a
 * coach that exists to be asked. A share of a day carries the one fact that
 * changes her behaviour usefully (there is a limit, and here is where you are
 * against it) and none of the fact that only makes her hesitate.
 */
export function CoachBudget({ usage }: { usage: Usage }) {
  const router = useRouter();
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { usedPercent, remainingPercent, capPercent, requests } = usage;
  const spent = remainingPercent <= 0;

  async function choose(percent: number) {
    setSaving(percent);
    setError(null);
    try {
      await action("set_coach_budget", { percentOfMax: percent === 100 ? null : percent });
      router.refresh();
    } catch (err) {
      // A spend limit she believes she set and did not is worse than none.
      setError(actionMessage(err, "That limit didn't save — try again."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Coach allowance</h2>
        <span className={`text-[13px] tabular ${spent ? "text-hold" : "text-muted"}`}>
          {spent ? "All used" : `${remainingPercent}% left today`}
        </span>
      </button>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full transition-all ${spent ? "bg-hold" : "bg-accent"}`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>

      <p className="mt-2 text-[12px] text-faint">
        {spent
          ? "Today's allowance is used up. Your coach is back tomorrow — everything else still works."
          : `${requests} message${requests === 1 ? "" : "s"} today. Resets at midnight.`}
      </p>

      {open && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Daily allowance</p>
          <div className="flex flex-wrap gap-2">
            {CAPS.map((percent) => (
              <button
                key={percent}
                onClick={() => choose(percent)}
                disabled={saving !== null}
                className={`rounded-full border px-4 py-2 text-[13px] tabular disabled:opacity-50 ${
                  capPercent === percent ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
                }`}
              >
                {percent === 100 ? "Full" : `${percent}%`}
              </button>
            ))}
          </div>
          {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            A full day is as much as this app will ever use. Lower it if you&rsquo;d rather
            it lasted differently — you can&rsquo;t raise it past full.
          </p>
        </div>
      )}
    </section>
  );
}
