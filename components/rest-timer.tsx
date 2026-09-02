"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The rest timer.
 *
 * Everything is derived from `endsAt` — an absolute timestamp — and never from
 * counted ticks. iOS throttles timers in a backgrounded tab to a crawl, so a
 * `setInterval` that adds up seconds loses minutes over a single workout. The
 * interval here only decides when to repaint; the arithmetic is always
 * `endsAt - Date.now()`, which is correct however long the tab was asleep.
 */
export type Rest = {
  slug: string;
  name: string;
  /** Absolute wall-clock time the rest is over. */
  endsAt: number;
  /** Total rest, for the progress line. Grows with "+30s". */
  seconds: number;
};

/* ---------------------------------------------------------------- sound --- */

let audio: AudioContext | null = null;

type WithWebkitAudio = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

/**
 * Must be called from inside a real user gesture — logging a set counts. iOS
 * will not let a page create or resume an AudioContext any other way, and one
 * created outside a gesture stays suspended forever, silently.
 */
export function unlockAudio() {
  try {
    const Ctor = window.AudioContext ?? (globalThis as WithWebkitAudio).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === "suspended") void audio.resume();
    // Playing one silent sample is what actually flips Safari's "this page may
    // make noise" bit; resume() alone is not always enough.
    const source = audio.createBufferSource();
    source.buffer = audio.createBuffer(1, 1, 22050);
    source.connect(audio.destination);
    source.start(0);
  } catch {
    /* No Web Audio: the timer still counts, it just won't beep. */
  }
}

/** Two short beeps, synthesised — no audio file, no dependency. */
function beep() {
  const ctx = audio;
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    if (ctx.state !== "running") return; // backgrounded on iOS — nothing will sound
    const t0 = ctx.currentTime;
    for (const offset of [0, 0.22]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t0 + offset);
      // Ramp rather than switch, or it clicks.
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.2);
    }
  } catch {
    /* ignore — a missing beep must never break the workout */
  }
}

function fireAlarm() {
  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {
    /* unsupported on iOS Safari; Android buzzes */
  }
  beep();
}

/* ------------------------------------------------------------ wake lock --- */

/**
 * Holding the screen awake is the only thing that reliably keeps the beep
 * audible: a locked or backgrounded iOS PWA has its AudioContext suspended and
 * cannot make a sound. This at least stops the idle auto-lock from killing the
 * timer mid-rest. Unsupported everywhere else, and that is fine.
 */
function useScreenAwake(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        /* denied, low battery, or not visible — nothing to do */
      }
    };
    // iOS drops the lock whenever the app is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !sentinel) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

/* ----------------------------------------------------------------- bar ---- */

/** Milliseconds left, recomputed from the clock — never accumulated. */
function useRemaining(endsAt: number) {
  const [ms, setMs] = useState(() => endsAt - Date.now());

  useEffect(() => {
    const sync = () => setMs(endsAt - Date.now());
    sync();
    const id = window.setInterval(sync, 250);
    // Coming back from a locked screen or another tab: resync immediately
    // rather than waiting for a throttled interval to catch up.
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [endsAt]);

  return ms;
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function RestTimerBar({
  rest, onExtend, onDismiss,
}: {
  rest: Rest;
  onExtend: (seconds: number) => void;
  onDismiss: () => void;
}) {
  const ms = useRemaining(rest.endsAt);
  const over = ms <= 0;
  const firedFor = useRef<number | null>(null);

  useScreenAwake(!over);

  useEffect(() => {
    if (!over || firedFor.current === rest.endsAt) return;
    firedFor.current = rest.endsAt;
    // If the phone was locked through the whole rest, this runs on the way
    // back in — late, but she still gets the buzz and the beep.
    fireAlarm();
  }, [over, rest.endsAt]);

  // Don't leave "Rest over" sitting there forever if she never taps it.
  useEffect(() => {
    if (ms > -20_000) return;
    onDismiss();
  }, [ms, onDismiss]);

  const pct = over ? 0 : Math.max(0, Math.min(100, (ms / (rest.seconds * 1000)) * 100));

  // Sticky to the viewport, so it stays with her wherever she scrolls on the
  // Train screen. The safe-area inset keeps it clear of the notch when
  // installed to the home screen — the body's own top padding does not apply
  // to a sticky element, which is positioned against the viewport.
  return (
    <div className="sticky z-30 mb-3" style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}>
      <div
        className={`card overflow-hidden shadow-lg shadow-ink/60 backdrop-blur-xl ${
          over ? "border-beat/50 bg-beat-soft/95" : "bg-surface/95"
        }`}
      >
        <div className="flex items-center gap-3 p-2.5 pl-4">
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] uppercase tracking-wide ${over ? "text-beat" : "text-faint"}`}>
              {over ? "Rest over" : "Rest"}
            </p>
            <p className="truncate text-[13px] text-muted">{rest.name}</p>
          </div>

          {/* Not a live region. This repaints four times a second, and
              announcing it queued ninety uninterruptible "one twenty-nine, one
              twenty-eight…" updates that blocked everything else for the whole
              rest — materially worse than saying nothing. The one moment worth
              announcing is when it is over, below. */}
          <span
            aria-hidden={!over}
            className={`shrink-0 text-2xl font-semibold tabular ${over ? "text-beat" : "text-text"}`}
          >
            {over ? "Go" : clock(ms)}
          </span>
          <span className="sr-only" role="status">
            {over ? `Rest over for ${rest.name}` : ""}
          </span>

          {!over && (
            <button
              onClick={() => onExtend(30)}
              className="shrink-0 rounded-lg border border-line bg-raised px-3 py-3 text-[12px] font-medium text-muted active:bg-line"
            >
              +30s
            </button>
          )}
          <button
            onClick={onDismiss}
            className={`shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold ${
              over ? "bg-beat text-ink" : "bg-raised text-text active:bg-line"
            }`}
          >
            {over ? "Done" : "Skip"}
          </button>
        </div>

        {!over && (
          <div className="h-1 bg-raised">
            <div className="h-full bg-accent transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
