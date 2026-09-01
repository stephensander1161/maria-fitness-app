import { PATTERNS, patternFor, type Joints, type Pattern } from "@/lib/movement-patterns";

/**
 * A wireframe figure for a movement, animated between its start and end
 * positions so the pattern reads at a glance.
 *
 * Pure SVG with no dependency and no network request: the whole thing is a few
 * hundred bytes and inherits the theme. Under prefers-reduced-motion it holds
 * the end position rather than cycling.
 */
export function ExerciseFigure({
  slug,
  category,
  className = "",
}: {
  slug: string;
  category: string;
  className?: string;
}) {
  const pattern = PATTERNS[patternFor(slug, category)];
  const box = frame(pattern);

  return (
    <figure className={`relative ${className}`}>
      <svg viewBox={box} className="h-full w-full" role="img" aria-label={pattern.label}>
        {/* Ground line, so a lying-down pose reads as lying down. */}
        <line x1="0" y1="96" x2="100" y2="96" stroke="currentColor" strokeWidth="0.7" opacity="0.18" />
        <Figure joints={pattern.start} className="figure-start" opacity={0.28} />
        <Figure joints={pattern.end} className="figure-end" />
      </svg>
      <figcaption className="sr-only">{pattern.label}</figcaption>
    </figure>
  );
}

/**
 * Crop to the pose rather than always drawing the full 100×100 square.
 *
 * A standing figure occupies a narrow vertical strip; framed at full width it
 * renders as a thin mark, which is exactly what made the 36px thumbnails
 * illegible. Fitting the box also makes the stroke scale up on small figures
 * for free, since stroke width is in user units.
 */
function frame(pattern: Pattern): string {
  const points = [...Object.values(pattern.start), ...Object.values(pattern.end)];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  // Padding covers the head circle's radius and the stroke's own width.
  const pad = 10;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;

  // Square it up so the figure never stretches in a non-square container.
  const size = Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;
}

function Figure({
  joints, className, opacity = 1,
}: { joints: Joints; className?: string; opacity?: number }) {
  const { head, shoulder, elbow, hand, hip, knee, foot } = joints;
  const line = (a: [number, number], b: [number, number], key: string) => (
    <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
  );

  return (
    <g
      className={className}
      opacity={opacity}
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    >
      <circle cx={head[0]} cy={head[1]} r="6" strokeWidth="2.6" />
      {line(shoulder, hip, "spine")}
      {line(shoulder, elbow, "upperarm")}
      {line(elbow, hand, "forearm")}
      {line(hip, knee, "thigh")}
      {line(knee, foot, "shin")}
    </g>
  );
}
