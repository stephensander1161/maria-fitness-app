"use client";

import { macroBar, type MacroRow } from "@/lib/macro-progress";

/**
 * The day's four numbers as bars, in one place.
 *
 * Three screens want this picture — the moment after something is logged, the
 * Eat card when she taps the tally, and Progress — and three drawings of it
 * would be three sets of rounding and three ideas about what "over" means.
 * The judgement lives in lib/macro-progress.ts and this only paints it.
 */
export function MacroBars({ rows, compact = false }: { rows: MacroRow[]; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {rows.map((row) => {
        const b = macroBar(row);
        const track =
          b.state === "over" ? "bg-miss"
            : b.state === "there" ? "bg-beat"
              : b.state === "unknown" ? "bg-edge"
                : "bg-accent";
        return (
          <div key={b.key}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="uppercase tracking-wide text-faint">{b.label}</span>
              <span className={`tabular ${
                b.state === "over" ? "text-miss" : b.state === "there" ? "text-beat" : "text-muted"
              }`}>
                {/* A floor says so, here as everywhere else in the app. */}
                {b.complete ? "" : "≥"}{b.value}{b.suffix}
                {b.target !== null && <span className="text-faint"> / {b.target}{b.suffix}</span>}
                {b.over > 0 && <span className="text-miss"> · {b.over} over</span>}
              </span>
            </div>
            <div
              className={`mt-1 w-full overflow-hidden rounded-full bg-raised ${compact ? "h-1.5" : "h-2"}`}
              role="img"
              aria-label={`${b.label}: ${b.complete ? "" : "at least "}${b.value}${b.suffix}${
                b.target !== null ? ` of ${b.target}${b.suffix}` : ""
              }`}
            >
              {b.fill !== null && (
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${track}`}
                  style={{ width: `${Math.round(b.fill * 100)}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
