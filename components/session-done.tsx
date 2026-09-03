"use client";

import { useEffect, useRef } from "react";

/**
 * The end of a workout, said properly.
 *
 * "Session complete. Nice work." in 13px grey was the whole celebration for
 * the thing the entire app exists to get her to do. This is the other end of
 * the scale from the small tick a card gets for hitting its target sets: that
 * one is a nod mid-session, this one is the session.
 *
 * Same rules as the GO screen — it stays until she clears it, takes any tap
 * or key, and is not a modal, because there is nothing in it to interact with
 * and nothing behind it that needs blocking.
 */
export function SessionDone({
  sets, volume, unit, movements, onClose,
}: {
  sets: number;
  volume: number;
  unit: string;
  movements: number;
  onClose: () => void;
}) {
  const closed = useRef(false);

  useEffect(() => {
    const go = () => {
      if (closed.current) return;
      closed.current = true;
      onClose();
    };
    window.addEventListener("keydown", go);
    window.addEventListener("pointerdown", go);
    return () => {
      window.removeEventListener("keydown", go);
      window.removeEventListener("pointerdown", go);
    };
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[90] grid place-items-center bg-ink/92 px-6 backdrop-blur-sm"
    >
      <span aria-hidden className="go-top absolute left-0 top-0 h-[3px] w-full bg-beat" />
      <span aria-hidden className="go-right absolute right-0 top-0 h-full w-[3px] bg-beat" />
      <span aria-hidden className="go-bottom absolute bottom-0 left-0 h-[3px] w-full bg-beat" />
      <span aria-hidden className="go-left absolute bottom-0 left-0 h-full w-[3px] bg-beat" />
      <span
        aria-hidden
        className="go-glow pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 90px 10px color-mix(in srgb, var(--color-beat) 40%, transparent)" }}
      />

      <div className="relative w-full max-w-sm text-center">
        <p className="go-word text-[clamp(2.2rem,11vw,4rem)] font-bold leading-none tracking-tight text-beat">
          That&rsquo;s the session
        </p>
        <p className="go-sub mt-3 text-[14px] text-muted">Logged and counted. Nothing to do now but eat and sleep.</p>

        <dl className="go-sub mt-7 grid grid-cols-3 gap-3">
          <Stat label="sets" value={String(sets)} />
          <Stat label="movements" value={String(movements)} />
          {/* Volume is meaningless for a session of bodyweight work, and a
              great fat zero under a real workout reads as a failure. */}
          <Stat label={volume > 0 ? `${unit} lifted` : "logged"} value={volume > 0 ? String(volume) : "✓"} />
        </dl>

        <p className="go-sub mt-8 text-[12px] text-faint">Tap anywhere to clear</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/60 px-2 py-3">
      <dd className="text-[20px] font-semibold tabular text-text">{value}</dd>
      <dt className="mt-0.5 text-[10px] uppercase tracking-wide text-faint">{label}</dt>
    </div>
  );
}
