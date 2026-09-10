import { formatSleep, SLEEP_SHORT_MIN, type SleepWindow } from "@/lib/sleep";
import { Headline } from "./progress-section";

/**
 * How she has been sleeping over one window.
 *
 * Renders *something* whether or not there is a figure, because a card that
 * disappears is indistinguishable from one that is broken and she never
 * learns the feature exists. When too little of the window is written down it
 * says so plainly — the average of two nights is not "how you slept this
 * month", and reporting it in the same typeface as a real figure is how this
 * app would end up telling her she slept five hours a night for a fortnight
 * she mostly did not log.
 */
export function SleepTrend({
  window: w, label, target,
}: { window: SleepWindow; label: string; target: number }) {
  const short = w.shortNights;
  return (
    <section className="card mb-3 p-5">
      <div className="flex items-end justify-between gap-4">
        {w.meanMinutes === null ? (
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular tracking-tight text-faint">—</p>
            <p className="mt-0.5 text-[12px] text-faint">{label}</p>
          </div>
        ) : (
          <Headline
            value={formatSleep(w.meanMinutes)}
            label={label}
            tone={w.meanMinutes >= target - 20 ? "good" : "plain"}
          />
        )}
        <Headline
          value={`${w.logged}/${w.nights}`}
          label={`night${w.nights === 1 ? "" : "s"} logged`}
        />
      </div>

      {w.meanMinutes === null ? (
        <p className="mt-3 border-t border-line/60 pt-3 text-[12px] leading-relaxed text-faint">
          {w.logged === 0
            ? "Nothing logged yet. A few nights and this starts to mean something."
            : `Only ${w.logged} of ${w.nights} nights written down — not enough to average honestly.`}
        </p>
      ) : short > 0 ? (
        /* Stated, never scolded. Nobody chooses a short night, and the useful
           half is what it does to training, not that it happened. */
        <p className="mt-3 border-t border-line/60 pt-3 text-[12px] leading-relaxed text-muted">
          {short} night{short === 1 ? "" : "s"} under {formatSleep(SLEEP_SHORT_MIN)}
          {short >= 3 && " — that shows up as heavier sessions and a bigger appetite before it shows up as tiredness."}
        </p>
      ) : (
        <p className="mt-3 border-t border-line/60 pt-3 text-[12px] text-muted">
          No nights under {formatSleep(SLEEP_SHORT_MIN)}. That is the part that matters most.
        </p>
      )}
    </section>
  );
}
