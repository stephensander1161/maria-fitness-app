/**
 * One horizon of the Progress screen.
 *
 * The page used to be one column of cards in the order they were built, which
 * meant this morning's weigh-in, last week's missed sessions and a lifetime
 * volume total sat next to each other with nothing to say which was which.
 * Four sections in ascending order — today, this week, this month, this year —
 * because that is how the question is actually asked: how am I doing *right
 * now*, and then how am I doing *overall*, and the answers are different
 * sizes of true.
 *
 * Ascending rather than descending on purpose. What she can still act on today
 * is at the top where it needs no scroll; the long view is underneath, where
 * it rewards a scroll rather than demanding one.
 */
export function ProgressSection({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-accent">{title}</h2>
        {hint && <p className="min-w-0 truncate text-[12px] text-faint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A number with its unit and a word under it. The shape every section uses. */
export function Headline({
  value, unit, label, tone = "plain",
}: { value: string; unit?: string; label: string; tone?: "plain" | "good" }) {
  return (
    <div className="min-w-0">
      <p className={`text-2xl font-bold tabular tracking-tight ${tone === "good" ? "text-beat" : ""}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>}
      </p>
      <p className="mt-0.5 text-[12px] text-faint">{label}</p>
    </div>
  );
}
