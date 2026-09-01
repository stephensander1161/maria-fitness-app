/**
 * Placeholders shown while a screen's data loads.
 *
 * Every page here is server-rendered against the database, which is 350–700ms.
 * Without these, tapping a tab does nothing at all for that long and then jumps
 * — which reads as the app being broken rather than busy. These make the tap
 * feel answered immediately, and the layout land in the same shape it will keep.
 */
export const Shimmer = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-raised ${className}`} />
);

export const CardSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="card space-y-3 p-5">
    <Shimmer className="h-4 w-1/3" />
    {Array.from({ length: lines }).map((_, i) => (
      <Shimmer key={i} className={i === lines - 1 ? "h-3 w-2/3" : "h-3"} />
    ))}
  </div>
);

export const PageSkeleton = ({
  title,
  cards = 3,
}: {
  title: string;
  cards?: number;
}) => (
  <>
    {/* The real heading, not a placeholder — it is known before the data is,
        so showing it immediately makes the navigation feel instant. */}
    <h1 className="mb-5 text-2xl font-bold tracking-tight">{title}</h1>
    <div className="space-y-3">
      {Array.from({ length: cards }).map((_, i) => (
        <CardSkeleton key={i} lines={i === 0 ? 4 : 2} />
      ))}
    </div>
  </>
);
