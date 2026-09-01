"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

export type Usage = {
  spentMicros: number;
  limitMicros: number;
  ceilingMicros: number;
  chosenMicros: number | null;
  requests: number;
};

const money = (micros: number) => {
  const dollars = micros / 1_000_000;
  return dollars < 1 ? `${Math.round(dollars * 100)}¢` : `$${dollars.toFixed(2)}`;
};

/**
 * Her control over what the coach may spend per day. It can only tighten the
 * deployment's ceiling, never raise it — the server clamps, and the options
 * offered here are generated from the ceiling so there is nothing to reach for
 * above it.
 */
export function CoachBudget({ usage }: { usage: Usage }) {
  const router = useRouter();
  const [saving, setSaving] = useState<number | "max" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { spentMicros, limitMicros, ceilingMicros, chosenMicros, requests } = usage;
  const pct = limitMicros > 0 ? Math.min(100, (spentMicros / limitMicros) * 100) : 0;
  const spent = pct >= 100;

  // Only offer amounts the deployment actually permits.
  const options = [100_000, 250_000, 500_000, 1_000_000, 2_000_000]
    .filter((m) => m < ceilingMicros)
    .concat(ceilingMicros);

  async function choose(micros: number | null) {
    setSaving(micros === null ? "max" : micros);
    setError(null);
    try {
      await action("set_coach_budget", { budgetMicros: micros });
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
        <h2 className="text-[15px] font-semibold">Coach budget</h2>
        <span className={`text-[13px] tabular ${spent ? "text-hold" : "text-muted"}`}>
          {money(spentMicros)} of {money(limitMicros)}
        </span>
      </button>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full transition-all ${spent ? "bg-hold" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-[12px] text-faint">
        {spent
          ? "Today's budget is used up. Your coach is back tomorrow — everything else still works."
          : `${requests} message${requests === 1 ? "" : "s"} today. Resets at midnight.`}
      </p>

      {open && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Daily limit</p>
          <div className="flex flex-wrap gap-2">
            {options.map((micros) => {
              const active =
                chosenMicros === null ? micros === ceilingMicros : chosenMicros === micros;
              return (
                <button
                  key={micros}
                  onClick={() => choose(micros === ceilingMicros ? null : micros)}
                  disabled={saving !== null}
                  className={`rounded-full border px-4 py-2 text-[13px] tabular disabled:opacity-50 ${
                    active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
                  }`}
                >
                  {money(micros)}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-2 text-[13px] text-miss">{error}</p>}
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            {money(ceilingMicros)} a day is the most this app will ever spend, set on the
            server. You can lower it here, not raise it.
          </p>
        </div>
      )}
    </section>
  );
}
