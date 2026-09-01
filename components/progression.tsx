"use client";

import { useState } from "react";
import type { ExerciseProgression } from "@/lib/progress";

const TONE = {
  climbing: { chip: "text-beat bg-beat-soft border-beat/40", bar: "bg-beat", label: "climbing" },
  holding:  { chip: "text-muted bg-raised border-line",      bar: "bg-line", label: "level" },
  slipping: { chip: "text-miss bg-miss-soft border-miss/40", bar: "bg-miss", label: "slipping" },
  stalled:  { chip: "text-hold bg-hold-soft border-hold/40", bar: "bg-hold", label: "dropped off" },
  new:      { chip: "text-faint bg-raised border-line",      bar: "bg-line", label: "new" },
} as const;

/**
 * Every movement, session by session, with the direction of travel.
 *
 * Ordered worst first on purpose: what's slipping or been abandoned is the part
 * that needs a decision, and burying it under the things going well is how a
 * progress screen becomes decoration.
 */
export function Progression({ items, unit }: { items: ExerciseProgression[]; unit: string }) {
  const [open, setOpen] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <section className="card mb-3 p-5">
        <h2 className="mb-2 text-[15px] font-semibold">Movements</h2>
        <p className="text-[13px] text-faint">
          Log a few sessions and each movement&apos;s trend appears here.
        </p>
      </section>
    );
  }

  const attention = items.filter((i) => i.trend === "slipping" || i.trend === "stalled");

  return (
    <section className="card mb-3 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Movements</h2>
        <span className="text-[11px] text-faint">last 12 weeks</span>
      </div>

      {attention.length > 0 && (
        <p className="mb-3 rounded-xl border border-hold/30 bg-hold-soft px-3 py-2 text-[12px] leading-relaxed text-hold">
          {attention.length} worth a look: {attention.map((a) => a.name).join(", ")}
        </p>
      )}

      <ul className="space-y-2.5">
        {items.map((item) => {
          const tone = TONE[item.trend];
          const expanded = open === item.slug;
          // Bodyweight movements are judged on reps; loaded ones on estimated 1RM.
          const metric = (s: ExerciseProgression["sessions"][number]) =>
            item.bodyweight ? s.reps : s.e1rm;
          const peak = Math.max(...item.sessions.map(metric), 1);

          return (
            <li key={item.slug} className="border-b border-line/60 pb-2.5 last:border-0 last:pb-0">
              <button
                onClick={() => setOpen(expanded ? null : item.slug)}
                className="flex w-full items-center gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{item.name}</p>
                  <p className="text-[11px] text-faint">
                    {item.sessions.length} session{item.sessions.length === 1 ? "" : "s"}
                    {item.daysSince > 0 && ` · ${item.daysSince}d ago`}
                  </p>
                </div>

                {/* Sparkline: enough to see the shape, not a chart to study. */}
                <div className="flex h-7 shrink-0 items-end gap-[3px]">
                  {item.sessions.slice(-8).map((s) => (
                    <span
                      key={s.date}
                      className={`w-[5px] rounded-sm ${tone.bar}`}
                      style={{ height: `${Math.max(15, (metric(s) / peak) * 100)}%` }}
                    />
                  ))}
                </div>

                <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${tone.chip}`}>
                  {item.changePct !== null && item.trend !== "stalled"
                    ? `${item.changePct > 0 ? "+" : ""}${Math.round(item.changePct)}%`
                    : tone.label}
                </span>
              </button>

              {expanded && (
                <div className="mt-2.5">
                  <p className="mb-2 text-[12px] leading-relaxed text-muted">{item.headline}</p>
                  <div className="space-y-1">
                    {item.sessions.slice().reverse().slice(0, 6).map((s) => (
                      <div key={s.date} className="flex justify-between text-[12px] tabular">
                        <span className="text-faint">{s.date}</span>
                        <span className="text-muted">
                          {s.sets}×{Math.round(s.reps / s.sets)}
                          {s.topSet !== null && ` @ ${s.topSet}${unit}`}
                          <span className="ml-2 text-faint">{s.volume}{unit} total</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
