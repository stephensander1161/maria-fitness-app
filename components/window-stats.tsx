/**
 * One horizon, three strands: training, food, body.
 *
 * The four sections on Progress each answered "how am I training?" and then
 * stopped — food appeared once, as today's bars, and the body only in the
 * month's tape measure. So a week that went well in the kitchen and badly in
 * the gym read as a bad week, and a month of eating had nowhere to show at all.
 *
 * Every figure here is *for the window named above it*, and every one of them
 * can say "not enough logged" instead of a number. That is the whole reason
 * this is one component rather than three: they have to be judged on the same
 * terms, or the strand with the least data quietly looks like the best one.
 */
type Cell = { value: string; unit?: string; sub: string; tone?: "good" | "plain" };

export function WindowStats({
  training, food, body,
}: {
  training: Cell | null;
  food: Cell | null;
  body: Cell | null;
}) {
  const cells = [
    { key: "training", label: "Training", cell: training, tone: training?.tone ?? "good" },
    { key: "food", label: "Food", cell: food, tone: food?.tone ?? "plain" },
    { key: "body", label: "Body", cell: body, tone: body?.tone ?? "plain" },
  ];

  return (
    <section className="card mb-3 grid grid-cols-3 gap-3 p-5">
      {cells.map(({ key, label, cell, tone }) => (
        <div key={key} className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</p>
          {cell ? (
            <>
              <p className={`mt-1 text-[19px] font-bold leading-tight tabular ${
                tone === "good" ? "text-beat" : "text-text"
              }`}>
                {cell.value}
                {cell.unit && <span className="ml-0.5 text-[12px] font-semibold text-muted">{cell.unit}</span>}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-faint">{cell.sub}</p>
            </>
          ) : (
            // Never a zero. Nothing logged and a real zero are different
            // answers, and this app is wrong in the direction that reads as
            // her failing if it flattens them.
            <>
              <p className="mt-1 text-[19px] font-bold leading-tight text-faint">—</p>
              <p className="mt-0.5 text-[11px] leading-snug text-faint">nothing logged</p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

/** "−0.4", "+1.2", "level" — a signed change, or null when there is none. */
export function signed(n: number | null): string | null {
  if (n === null) return null;
  if (n === 0) return "level";
  return `${n < 0 ? "−" : "+"}${Math.abs(n)}`;
}
