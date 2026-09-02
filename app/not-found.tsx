import Link from "next/link";

/** A stale link — usually a movement that has been renamed or removed. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-[19px] font-semibold">That page isn&rsquo;t here</h1>
      <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-muted">
        The link may be out of date. Your plan and everything you&rsquo;ve logged are fine.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/train" className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-ink">
          Today&rsquo;s session
        </Link>
        <Link href="/learn" className="rounded-full border border-line px-5 py-2.5 text-[14px] text-muted">
          The library
        </Link>
      </div>
    </div>
  );
}
