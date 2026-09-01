"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";
import type { DayFoodView } from "@/lib/views";

/**
 * What she has eaten today. Sits above the week's plan because the question
 * she actually has standing at the fridge is "where am I now", not "what was
 * I supposed to have on Thursday".
 */
export function TodayFood({ day }: { day: DayFoodView }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(id: string) {
    setRemoving(id);
    try {
      await action("remove_meal_log", { logId: id });
      router.refresh();
    } finally {
      setRemoving(null);
    }
  }

  if (day.logged.length === 0) {
    return (
      <section className="card mb-3 p-5">
        <h2 className="text-[15px] font-semibold">Today&rsquo;s food</h2>
        <p className="mt-1 text-[13px] text-faint">
          Nothing logged yet. Add food with the calculator below, or just tell your coach.
        </p>
      </section>
    );
  }

  const overCalories = day.calorieTarget !== null && day.calories > day.calorieTarget;

  return (
    <section className="card mb-3 p-5">
      <h2 className="mb-3 text-[15px] font-semibold">Today&rsquo;s food</h2>

      <div className="flex divide-x divide-line">
        <Stat
          label="Calories"
          value={day.calories.toString()}
          of={day.calorieTarget}
          tone={overCalories ? "over" : "on"}
        />
        <Stat label="Protein" value={`${day.proteinG}g`} of={day.proteinTargetG} suffix="g" />
        <Stat
          label="Fibre"
          // A total built from entries that carry no figure is a floor, not a
          // reading. Saying "12g" when lunch was typed in words claims
          // knowledge we do not have, and reads as failure at 30g.
          value={`${day.fibreComplete ? "" : "≥"}${day.fibreG}g`}
          of={day.fibreTargetG}
          suffix="g"
        />
      </div>

      {!day.fibreComplete && day.logged.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Fibre counts only what was looked up by name — anything described in words isn&rsquo;t in that total.
        </p>
      )}

      <ul className="mt-3 space-y-0.5">
        {day.logged.map((l) => (
          <li key={l.id} className="flex items-baseline gap-2 border-b border-line/60 py-2 last:border-0">
            <span className="w-[62px] shrink-0 text-[11px] uppercase tracking-wide text-accent">
              {l.slot}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px]">{l.description}</span>
            <span className="shrink-0 text-[12px] tabular text-muted">
              {l.calories ?? "—"}
              {l.proteinG !== null && ` · ${l.proteinG}g`}
            </span>
            <button
              onClick={() => void remove(l.id)}
              disabled={removing === l.id}
              aria-label={`Remove ${l.description}`}
              className="-mr-1 shrink-0 px-1.5 text-faint transition-opacity active:text-miss disabled:opacity-30"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({
  label, value, of, suffix = "", tone = "on",
}: {
  label: string; value: string; of: number | null; suffix?: string; tone?: "on" | "over";
}) {
  return (
    <div className="flex-1 px-3 first:pl-0 last:pr-0">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className={`text-lg font-semibold tabular ${tone === "over" ? "text-miss" : ""}`}>{value}</p>
      {of !== null && (
        <p className="text-[11px] text-faint tabular">
          of {of}
          {suffix}
        </p>
      )}
    </div>
  );
}
