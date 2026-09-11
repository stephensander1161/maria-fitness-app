import { formatWater, type WaterSummary } from "@/lib/water";
import { Headline } from "./progress-section";

/**
 * How she has been drinking over one window.
 *
 * Same shape and same refusal as the sleep trend beside it: it renders
 * something whether or not there is a figure, and when too little of the
 * window is written down it says so rather than averaging three days across
 * thirty. Water is the easiest thing here to forget to log, so that refusal
 * does more work in this card than in any other.
 */
export function WaterTrend({
  window: w, label, target, units,
}: {
  window: WaterSummary;
  label: string;
  target: number;
  units: "metric" | "imperial";
}) {
  return (
    <section className="card mb-3 p-5">
      <div className="flex items-end justify-between gap-4">
        {w.meanMl === null ? (
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular tracking-tight text-faint">—</p>
            <p className="mt-0.5 text-[12px] text-faint">{label}</p>
          </div>
        ) : (
          <Headline
            value={formatWater(w.meanMl, units)}
            label={label}
            tone={w.meanMl >= target * 0.9 ? "good" : "plain"}
          />
        )}
        <Headline value={`${w.logged}/${w.days}`} label={`day${w.days === 1 ? "" : "s"} logged`} />
      </div>

      {w.meanMl === null ? (
        <p className="mt-3 border-t border-line/60 pt-3 text-[12px] leading-relaxed text-faint">
          {w.logged === 0
            ? "Nothing logged yet. Tap a glass on the Eat screen as you go and this fills in."
            : `Only ${w.logged} of ${w.days} days written down — not enough to average honestly.`}
        </p>
      ) : (
        <p className="mt-3 border-t border-line/60 pt-3 text-[12px] leading-relaxed text-muted">
          {w.daysOnTarget} of {w.logged} logged day{w.logged === 1 ? "" : "s"} at{" "}
          {formatWater(target, units)} or more.
          {w.confidence === "thin" && " Some days are missing, so this is a floor."}
        </p>
      )}
    </section>
  );
}
