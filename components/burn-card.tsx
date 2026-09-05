import { BURN_CAVEAT } from "@/lib/burn";

/**
 * What training probably cost, wherever that is worth knowing.
 *
 * The caveat travels with the number rather than living in a footnote, because
 * the number is the kind people act on. Two things it must always say: it is
 * an estimate from population averages, and it is not extra food.
 */
export function BurnCard({
  title, kcal, sub, sessions,
}: {
  title: string;
  kcal: number | null;
  sub?: string;
  sessions?: number;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sessions !== undefined && (
          <span className="text-[11px] uppercase tracking-widest text-faint">
            {sessions} session{sessions === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {kcal === null || kcal === 0 ? (
        // Not "0 kcal": a week with no session is not a week that burned
        // nothing, and a zero next to a number reads as a failure.
        <p className="mt-2 text-[13px] text-muted">
          Nothing logged yet. Log a session and the estimate appears here.
        </p>
      ) : (
        <p className="mt-1 text-[26px] font-semibold tabular-nums">
          about {kcal.toLocaleString()}
          <span className="ml-1 text-[13px] font-normal text-muted">kcal{sub ? ` ${sub}` : ""}</span>
        </p>
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-faint">{BURN_CAVEAT}</p>
    </section>
  );
}
