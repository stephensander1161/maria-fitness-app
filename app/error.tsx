"use client";

import { useEffect } from "react";

/**
 * One Neon blip used to replace a whole tab with Next's unstyled white page:
 * no tab bar, no way back, and in an installed PWA no browser chrome either,
 * so force-quitting the app was the only exit.
 */
export default function ErrorScreen({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side detail stays server-side; this is the client's own record.
    console.error("[screen]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-[19px] font-semibold">That screen didn&rsquo;t load</h1>
      <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-muted">
        Usually the connection. Nothing you&rsquo;ve logged is affected.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-ink"
        >
          Try again
        </button>
        <a
          href="/train"
          className="rounded-full border border-line px-5 py-2.5 text-[14px] text-muted"
        >
          Today&rsquo;s session
        </a>
      </div>
    </div>
  );
}
