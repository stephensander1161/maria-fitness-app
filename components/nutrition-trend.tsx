import type { NutritionTrend } from "@/lib/progress";
import { prettyDate } from "@/lib/date";

/**
 * Eating over the last fortnight. The bar for a day she did not log is drawn
 * empty rather than short — an unlogged day is missing information, and drawing
 * it as a small number reads as a day she barely ate.
 */
export function NutritionTrendCard({ trend }: { trend: NutritionTrend }) {
  if (trend.trend === "no-data") {
    return (
      <section className="card mb-3 p-5">
        <h2 className="text-[15px] font-semibold">Eating</h2>
        <p className="mt-1 text-[13px] text-faint">
          Nothing logged yet. Log a few meals and the pattern shows up here.
        </p>
      </section>
    );
  }

  const target = trend.calorieTarget;
  const ceiling = Math.max(
    target ?? 0,
    ...trend.days.map((d) => d.calories ?? 0),
  ) * 1.15 || 1;

  return (
    <section className="card mb-3 p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Eating</h2>
        <span className="text-[11px] uppercase tracking-wide text-faint">
          last {trend.windowDays} days
        </span>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-muted">{trend.headline}</p>

      {/* One labelled image rather than fourteen title tooltips: a screen
          reader gets the day-by-day reading in a sentence, and the bars
          themselves are presentational. */}
      <div
        role="img"
        aria-label={describeDays(trend)}
        className="relative flex h-24 items-end gap-[3px]"
      >
        {target !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent/50"
            style={{ bottom: `${(target / ceiling) * 100}%` }}
          />
        )}
        {trend.days.map((d) => {
          const over = target !== null && d.caloriesComplete && (d.calories ?? 0) > target;
          return (
            <div key={d.date} className="group relative flex-1">
              {d.logged && d.caloriesComplete ? (
                <div
                  className={`w-full rounded-sm ${over ? "bg-miss/70" : "bg-accent/70"}`}
                  style={{ height: `${Math.max(3, ((d.calories ?? 0) / ceiling) * 96)}px` }}
                  title={`${d.date}: ${d.calories} kcal`}
                />
              ) : d.logged ? (
                // Logged, but with no figures on some of it. Drawn as the floor
                // it is — a solid part up to what was counted, dashed above —
                // rather than as a short bar that says she barely ate.
                <div
                  className="flex w-full flex-col justify-end rounded-sm border border-dashed border-line"
                  style={{ height: "96px" }}
                  title={`${d.date}: at least ${d.calories} kcal, some entries not counted`}
                >
                  <div
                    className="w-full rounded-sm bg-accent/35"
                    style={{ height: `${Math.max(3, ((d.calories ?? 0) / ceiling) * 96)}px` }}
                  />
                </div>
              ) : (
                // Empty, not short: we do not know what she ate, and a small
                // bar would say she barely ate.
                <div
                  className="w-full rounded-sm border border-dashed border-line"
                  style={{ height: "96px" }}
                  title={`${d.date}: not logged`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex divide-x divide-line">
        <Stat
          label="Days counted"
          value={`${trend.daysCounted}/${trend.windowDays}`}
          sub={trend.daysLogged > trend.daysCounted ? `${trend.daysLogged} logged` : undefined}
        />
        <Stat
          label="Avg kcal"
          value={trend.avgCalories === null ? "—" : trend.avgCalories.toString()}
          sub={target !== null ? `of ${target}` : undefined}
        />
        <Stat
          label="Avg protein"
          value={trend.avgProteinG === null ? "—" : `${trend.avgProteinG}g`}
          sub={trend.proteinTargetG !== null ? `of ${trend.proteinTargetG}g` : undefined}
        />
      </div>

      <p className="mt-2 text-[11px] text-faint">
        Averages cover only the days where every entry carried figures. A dashed bar is a day with
        nothing logged, or one where some of what she ate has no numbers on it.
      </p>
    </section>
  );
}

function describeDays(trend: NutritionTrend): string {
  const days = trend.days
    .map((d) => {
      if (!d.logged) return `${prettyDate(d.date)} not logged`;
      // "0 kcal" for a day she logged three meals is the whole bug, spoken.
      return `${prettyDate(d.date)} ${d.caloriesComplete ? "" : "at least "}${d.calories} kcal`;
    })
    .join(", ");
  const target = trend.calorieTarget === null ? "" : ` Target ${trend.calorieTarget} kcal a day.`;
  return `Calories by day, last ${trend.windowDays} days: ${days}.${target}`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 px-3 first:pl-0 last:pr-0">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="text-lg font-semibold tabular">{value}</p>
      {sub && <p className="text-[11px] text-faint tabular">{sub}</p>}
    </div>
  );
}
