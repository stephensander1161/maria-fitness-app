import { axisDate, type ISODate } from "@/lib/date";

/**
 * Weight over time: the trend is the line, the weigh-ins are dots behind it.
 *
 * Drawing the raw readings as a line made a fluid swing look like a fortnight
 * of lost progress. The dots keep her actual numbers visible — she weighed
 * what she weighed — while the line is the thing worth reading.
 *
 * **It has axes now.** It did not, on the reasoning that the shape is the
 * message and the exact numbers live right above it. That is true of the
 * *latest* number and false of every other one: a line that rises has no
 * scale, so half a pound of noise and five pounds of gain draw the same
 * picture, and there was nothing on the chart to say which this was. Two
 * figures on the left and two dates underneath are the least that makes it a
 * chart rather than a decoration.
 *
 * The labels are HTML around the SVG rather than `<text>` inside it, because
 * the plot is drawn with `preserveAspectRatio="none"` — it stretches to the
 * card's width, and anything inside it stretches too. Text that stretches is
 * text nobody can read.
 */
export function Sparkline({
  points, goal, trend, dates, unit,
}: {
  points: number[];
  goal: number | null;
  trend?: number[];
  /** One per point, oldest first. Absent on a chart with no dates to show. */
  dates?: ISODate[];
  /** Her unit, for the two figures on the left. */
  unit?: string;
}) {
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

  /*
    The scale, labelled at her readings rather than at the box.

    `min` and `max` are the padded bounds, which exist to stop a flat series
    rendering as a solid block — they are not numbers she has ever weighed.
    The labels say the highest and lowest readings on the chart, which are,
    and they sit at the height those readings are drawn at.
  */
  const round = (v: number) => (Math.abs(hi - lo) < 10 ? v.toFixed(1) : Math.round(v).toString());
  const at = (v: number) => `${(y(v) / H) * 100}%`;
  const suffix = unit ? ` ${unit}` : "";

  const first = dates?.[0];
  const last = dates?.[dates.length - 1];
  const middle = dates && dates.length > 3 ? dates[Math.floor((dates.length - 1) / 2)] : null;

  return (
    <figure className="m-0">
      <div className="flex gap-2">
        {/*
          The scale, in a gutter of its own rather than over the plot. Laid on
          top it sat on the line exactly when the line was interesting — a
          trend that ends high ends where the top label is.
        */}
        <div
          aria-hidden
          className="relative w-10 shrink-0 text-right text-[10px] tabular leading-none text-faint"
          style={{ height: "6rem" }}
        >
          <span className="absolute right-0 -translate-y-1/2" style={{ top: at(hi) }}>
            {round(hi)}
          </span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: at(lo) }}>
            {round(lo)}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-24 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={
            `Weight from ${round(lo)}${suffix} to ${round(hi)}${suffix}` +
            (first && last ? `, ${axisDate(first)} to ${axisDate(last)}` : "")
          }
        >
          <defs>
            <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* The two heights the labels name, so the eye can carry one across.
              Decorative weight — `--color-line`, never the control outline. */}
          {[hi, lo].map((v) => (
            <line
              key={v}
              x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)}
              stroke="var(--color-line)" strokeWidth="1" opacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
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
      </div>

      {first && last && (
        <figcaption
          aria-hidden
          className="mt-1.5 flex justify-between pl-12 text-[10px] tabular leading-none text-faint"
        >
          <span>{axisDate(first)}</span>
          {middle && <span>{axisDate(middle)}</span>}
          <span>{axisDate(last)}</span>
        </figcaption>
      )}
    </figure>
  );
}
