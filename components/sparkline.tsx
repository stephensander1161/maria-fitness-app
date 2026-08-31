/** Weight trend. Deliberately unlabelled and un-gridded — the shape is the
 *  message, and the exact numbers live right above it. */
export function Sparkline({ points, goal }: { points: number[]; goal: number | null }) {
  if (points.length < 2) {
    return <div className="grid h-24 place-items-center text-[13px] text-faint">
      Two weigh-ins and a trend line appears here.
    </div>;
  }

  const W = 320, H = 96, PAD = 6;
  const all = goal !== null ? [...points, goal] : points;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {goal !== null && goal >= min && goal <= max && (
        <line x1={PAD} x2={W - PAD} y1={y(goal)} y2={y(goal)}
          stroke="var(--color-beat)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
      )}
      <path d={area} fill="url(#trend)" />
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="3.5" fill="var(--color-accent)" />
    </svg>
  );
}
