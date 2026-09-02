/** Weight trend. Deliberately unlabelled and un-gridded — the shape is the
 *  message, and the exact numbers live right above it. */
/**
 * Weight over time: the trend is the line, the weigh-ins are dots behind it.
 *
 * Drawing the raw readings as a line made a fluid swing look like a fortnight
 * of lost progress. The dots keep her actual numbers visible — she weighed
 * what she weighed — while the line is the thing worth reading.
 */
export function Sparkline({
  points, goal, trend,
}: { points: number[]; goal: number | null; trend?: number[] }) {
  if (points.length < 2) {
    return <div className="grid h-24 place-items-center text-[13px] text-faint">
      Two weigh-ins and a trend line appears here.
    </div>;
  }

  const W = 320, H = 96, PAD = 6;

  // Scale to her actual weigh-ins, never to the goal. Including a goal 26 lb
  // away crushes every real reading into a flat line at the top of the box and
  // floods the rest with fill — which is how this looked for months.
  const all = trend && trend.length === points.length ? [...points, ...trend] : points;
  const lo = Math.min(...all), hi = Math.max(...all);
  // A near-flat series needs breathing room or it renders as a solid block.
  const pad = Math.max((hi - lo) * 0.25, 0.5);
  const min = lo - pad, max = hi + pad;
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  // The trend is what gets drawn as a line; without one, the raw series is.
  const drawn = trend && trend.length === points.length ? trend : points;
  const line = drawn.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {goal !== null && (
        goal >= min && goal <= max ? (
          <line x1={PAD} x2={W - PAD} y1={y(goal)} y2={y(goal)}
            stroke="var(--color-beat)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        ) : (
          // Goal is off-scale: mark the edge it lies beyond rather than
          // distorting the whole chart to include it.
          <line
            x1={PAD} x2={W - PAD}
            y1={goal < min ? H - 1 : 1} y2={goal < min ? H - 1 : 1}
            stroke="var(--color-beat)" strokeWidth="1" strokeDasharray="2 6" opacity="0.35"
          />
        )
      )}
      <path d={area} fill="url(#trend)" />
      {/* Her actual weigh-ins, behind the trend rather than instead of it. */}
      {trend && trend.length === points.length && points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p)} r="1.6" fill="var(--color-faint)" opacity="0.75" />
      ))}
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(points.length - 1)} cy={y(drawn[drawn.length - 1])} r="3.5" fill="var(--color-accent)" />
    </svg>
  );
}
