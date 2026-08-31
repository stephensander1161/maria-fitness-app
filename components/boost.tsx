"use client";

import { useEffect, useState } from "react";
import { action } from "@/lib/client";

type Evidence = { headline: string; detail?: string };
type Boost = {
  opener: string;
  evidence: Evidence[];
  fact: { text: string; source: string | null; category: string } | null;
  hasData: boolean;
};

/** Deterministic per-particle offsets — Math.random() here would differ between
 *  server and client render and trip hydration. */
const SPARKS = [8, 24, 41, 57, 68, 79, 90].map((left, i) => ({
  left,
  delay: i * 420,
  size: i % 3 === 0 ? 4 : 3,
}));

export function Boost({ onClose }: { onClose: () => void }) {
  const [boost, setBoost] = useState<Boost | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    action<Boost>("get_boost").then(setBoost).catch(() => setFailed(true));
  }, []);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-ink/95 px-7 backdrop-blur-md"
    >
      {/* Bloom behind everything */}
      <div
        aria-hidden
        className="boost-bloom pointer-events-none absolute size-[26rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 30%, transparent) 0%, transparent 70%)",
        }}
      />

      {SPARKS.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="boost-drift pointer-events-none absolute bottom-1/3 rounded-full bg-accent"
          style={{ left: `${s.left}%`, width: s.size, height: s.size, animationDelay: `${s.delay}ms` }}
        />
      ))}

      <div className="relative z-10 w-full max-w-sm text-center">
        {failed ? (
          <p className="text-[15px] text-muted">Couldn&apos;t load that right now.</p>
        ) : !boost ? (
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent"
                style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        ) : (
          <>
            <p className="boost-rise text-[26px] font-bold leading-tight tracking-tight">
              {boost.opener}
            </p>

            <div className="relative my-5 h-px overflow-hidden bg-line">
              <span aria-hidden className="boost-sweep absolute inset-y-0 w-1/3 bg-accent" />
            </div>

            {boost.evidence.slice(0, 3).map((e, i) => (
              <div key={i} className="boost-rise mb-4" style={{ animationDelay: `${420 + i * 200}ms` }}>
                <p className="text-[19px] font-semibold text-accent tabular">{e.headline}</p>
                {e.detail && <p className="mt-1 text-[14px] leading-relaxed text-muted">{e.detail}</p>}
              </div>
            ))}

            {!boost.hasData && (
              <p className="boost-rise text-[15px] leading-relaxed text-muted"
                style={{ animationDelay: "420ms" }}>
                Log a session and this fills with your own numbers instead of my words.
              </p>
            )}

            {boost.fact && (
              <div
                className="boost-rise mt-7 rounded-2xl border border-line bg-surface p-4 text-left"
                style={{ animationDelay: `${520 + boost.evidence.length * 200}ms` }}
              >
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
                  Worth knowing
                </p>
                <p className="text-[14px] leading-relaxed">{boost.fact.text}</p>
                {boost.fact.source && (
                  <p className="mt-2 text-[11px] text-faint">{boost.fact.source}</p>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="boost-rise mt-8 rounded-full border border-line px-6 py-2.5 text-[14px] text-muted"
              style={{ animationDelay: "1100ms" }}
            >
              Back to it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
