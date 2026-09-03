"use client";

import { useEffect, useRef, useState } from "react";
import { PATTERNS } from "@/lib/movement-patterns";

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
  /** Which figure the GO screen draws. Carried here because the timer now
      outlives the Train screen that knows the exercise. */
  category: string;
  /**
   * Everything needed to log the *next* set without going back to the card.
   *
   * The point of the GO screen is that she is standing at the rack having
   * just finished a set — so the numbers go in there, and logging them starts
   * the next rest. Carried on the rest itself because the timer outlives the
   * screen that knew them.
   */
  unit: string;
  /** What to seed the entry with: her last set of this movement. */
  reps: number;
  weight: number | null;
  /** Whether this movement can hold a weight at all. */
  loadable: boolean;
  /** The day the set belongs to. Undefined means her today. */
  date?: string;
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

/** Six beeps over a second and a half — synthesised, no audio file. */
function beep() {
  const ctx = audio;
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    if (ctx.state !== "running") return; // backgrounded on iOS — nothing will sound
    const t0 = ctx.currentTime;
    // Two polite pips are what a microwave does, and a phone face-down on a
    // bench next to a squat rack is not a kitchen. This is a run of six, rising
    // at the end, long enough to be noticed across a room.
    for (const offset of [0, 0.22, 0.44, 0.66, 0.88, 1.1]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(offset >= 0.88 ? 1174 : 880, t0 + offset);
      // Ramp rather than switch, or it clicks.
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + offset + 0.02);
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

/**
 * A notification, for the case the beep cannot cover: the phone is locked or
 * the app is in the background, where iOS suspends the AudioContext and
 * nothing this page draws is on screen at all.
 *
 * Only ever shown if she has already granted permission. Asking is a separate,
 * deliberate act — see `askToNotify`, which runs off a tap.
 */
function notify(name: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return; // she is looking at it
    new Notification("Rest over", { body: name, tag: "coach-rest", silent: false });
  } catch {
    /* not supported, or blocked in an iframe */
  }
}

/**
 * Ask once, from inside a tap. Browsers reject a permission prompt that is not
 * tied to a gesture, and asking on page load is the thing that trains people
 * to hit Block forever.
 */
export function askToNotify() {
  try {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    void Notification.requestPermission();
  } catch {
    /* Safari once made this callback-only; not worth a shim */
  }
}

function fireAlarm(name: string) {
  try {
    // Long, and repeated. A single buzz through a pocket is missable.
    navigator.vibrate?.([250, 100, 250, 100, 400]);
  } catch {
    /* unsupported on iOS Safari; Android buzzes */
  }
  beep();
  notify(name);
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

/* ------------------------------------------------------------- tumbler ---- */

/**
 * The little wireframe figure, cartwheeling backwards down the fuse.
 *
 * It cycles through the same movement patterns the library draws, one every
 * three quarters of a second, so it reads as a figure tumbling rather than a
 * spinning icon. Pure decoration — but the bar was the one thing on this
 * screen anyone actually watches, and now it is worth watching.
 */
const TUMBLE = ["squat", "hinge", "lunge", "cardio", "rotation", "carry"] as const;

/** How long one pose takes to melt into the next. */
const POSE_MS = 620;
/** One length of the bar, there or back. Faster than the bar it runs on. */
const LAP_MS = 2600;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPoint = (
  a: [number, number], b: [number, number], t: number,
): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Ease in and out, so a pose arrives and leaves rather than snapping. */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Where the runner is along the bar, 0–100, bouncing off both ends.
 *
 * Deliberately not tied to the countdown. Riding the burning end of the fuse
 * sounded right and read as a stutter — the bar creeps, so the figure crept
 * with it. It is quicker than the thing it runs on, and turns around when it
 * gets to the end.
 */
function lapPosition(elapsedMs: number): number {
  const phase = (elapsedMs % (LAP_MS * 2)) / LAP_MS;
  return (phase <= 1 ? phase : 2 - phase) * 100;
}

/** How long one hop takes, and how high it goes in pixels. */
const HOP_MS = 700;
const HOP_PX = 9;

/**
 * How far off the bar the figure is, in pixels.
 *
 * A ball on a flat floor: up fast, over the top, down fast, and a beat on the
 * ground before the next one. `1 - (2t - 1)²` is a parabola through zero at
 * both ends and one in the middle, which is exactly the shape a thrown thing
 * makes — running the whole hop as a sine wave instead gives a hover, and a
 * figure that hovers is floating rather than bouncing.
 */
function hopHeight(elapsedMs: number): number {
  // A fifth of each cycle is spent on the ground, so the hops read as
  // separate rather than as one continuous wobble.
  const t = (elapsedMs % HOP_MS) / HOP_MS / 0.8;
  if (t >= 1) return 0;
  const arc = 1 - (2 * t - 1) ** 2;
  return arc * HOP_PX;
}

function TumblingFigure({ elapsed }: { elapsed: number }) {
  // Blend between consecutive poses rather than cutting between them. Six
  // drawings swapped on a timer is a flip-book; six drawings interpolated is
  // a body moving.
  const step = elapsed / POSE_MS;
  const i = Math.floor(step) % TUMBLE.length;
  const from = PATTERNS[TUMBLE[i]] ?? PATTERNS.squat;
  const to = PATTERNS[TUMBLE[(i + 1) % TUMBLE.length]] ?? PATTERNS.squat;
  const t = ease(step - Math.floor(step));

  const j = {
    head: lerpPoint(from.end.head, to.end.head, t),
    shoulder: lerpPoint(from.end.shoulder, to.end.shoulder, t),
    elbow: lerpPoint(from.end.elbow, to.end.elbow, t),
    hand: lerpPoint(from.end.hand, to.end.hand, t),
    hip: lerpPoint(from.end.hip, to.end.hip, t),
    knee: lerpPoint(from.end.knee, to.end.knee, t),
    foot: lerpPoint(from.end.foot, to.end.foot, t),
  };

  const line = (a: [number, number], b: [number, number]) =>
    `M${a[0]},${a[1]}L${b[0]},${b[1]}`;

  return (
    <svg width="22" height="22" viewBox="0 0 100 100" className="rest-tumble" aria-hidden>
      <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx={j.head[0]} cy={j.head[1]} r="7" fill="currentColor" stroke="none" />
        <path d={line(j.shoulder, j.hip)} />
        <path d={line(j.shoulder, j.elbow)} />
        <path d={line(j.elbow, j.hand)} />
        <path d={line(j.hip, j.knee)} />
        <path d={line(j.knee, j.foot)} />
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------------- bar ---- */

/**
 * A frame clock for the one thing on this bar that has to move smoothly.
 *
 * The countdown repaints four times a second, which is right for a number
 * counting down and far too coarse for a figure running along a bar — at
 * 250ms it lurches. This runs only while there is something to animate, and
 * not at all when she has asked for less motion.
 */
function useFrameClock(active: boolean): number {
  // Zero until the first frame lands, which is also the server's value — so
  // there is nothing to mismatch on hydration.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      // One frame is enough when she has asked for less motion: the figure
      // takes a position and holds it.
      if (!still) raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

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
  rest, onExtend, onDismiss, onOver,
}: {
  rest: Rest;
  onExtend: (seconds: number) => void;
  onDismiss: () => void;
  /** Fired once, the moment the clock reaches zero. */
  onOver?: () => void;
}) {
  const ms = useRemaining(rest.endsAt);
  const over = ms <= 0;
  // Nothing to draw once it is over: the GO screen has the whole screen and
  // the entry on it, and a green "Go / Done" bar behind that was a second
  // copy of the same news with a button that did less. The component stays
  // mounted, because it is what fires the alarm.
  // Elapsed, not remaining: the runner's pace is its own and does not slow
  // down as the rest runs out. Read from the clock rather than from `ms`, so
  // it is smooth between the countdown's four repaints a second.
  const now = useFrameClock(!over);
  const startedAt = rest.endsAt - rest.seconds * 1000;
  const elapsed = now === 0 ? 0 : now - startedAt;
  const firedFor = useRef<number | null>(null);

  useScreenAwake(!over);

  useEffect(() => {
    if (!over || firedFor.current === rest.endsAt) return;
    firedFor.current = rest.endsAt;
    // If the phone was locked through the whole rest, this runs on the way
    // back in — late, but she still gets the buzz and the beep.
    fireAlarm(rest.name);
    onOver?.();
    // `rest.name` only rides along for the notification text; `firedFor` is
    // what guarantees one alarm per rest however often this re-runs.
  }, [over, rest.endsAt, rest.name, onOver]);

  /**
   * The tab itself shouts. On a desktop the app is usually behind an editor or
   * a browser tab she has switched away from, where a beep may be muted and
   * the GO screen is not being looked at — the title is the one thing still
   * visible in that state.
   */
  useEffect(() => {
    if (!over) return;
    const original = document.title;
    document.title = `GO — ${rest.name}`;
    return () => { document.title = original; };
  }, [over, rest.name]);

  // It used to clear itself twenty seconds after zero. That is the same
  // mistake the GO screen made: the case this exists for is a phone face-down
  // on a bench, and an alarm that gives up while she is mid-set is an alarm
  // she cannot rely on. It stays until she says so.

  // Escape stops it too — on a desktop the bar is a long way from the pointer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const pct = over ? 0 : Math.max(0, Math.min(100, (ms / (rest.seconds * 1000)) * 100));
  if (over) return null;

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
          {/* Always here, whatever the timer is doing. A countdown you cannot
              stop is the app telling her when she is allowed to lift. */}
          <button
            onClick={onDismiss}
            aria-label={over ? "Dismiss" : "Stop the rest timer"}
            className={`shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
              over ? "bg-beat text-ink" : "bg-raised text-text hover:bg-line active:bg-line"
            }`}
          >
            {over ? "Done" : "Stop"}
          </button>
        </div>

        {!over && (
          <div className="relative h-1 bg-raised">
            {/*
              It warms as it drains. A bar that is the same colour at five
              seconds as at ninety is only telling her the length, and the
              glance she actually takes is "how long have I got" — colour
              answers that before the number does.
            */}
            <div
              className="h-full transition-[width] duration-200 ease-linear"
              style={{
                width: `${pct}%`,
                background: `color-mix(in srgb, var(--color-miss) ${Math.round(100 - pct)}%, var(--color-accent))`,
              }}
            />
            {/*
              A figure cartwheeling up and down the bar, standing on it rather
              than hovering above it. It is decoration and it knows it —
              aria-hidden, and it holds still under prefers-reduced-motion.
            */}
            <span
              aria-hidden
              className="absolute bottom-full"
              style={{
                left: `${lapPosition(elapsed)}%`,
                // Bouncing as well as running: the vertical hop is its own
                // rhythm, faster than the length of the bar, so the two do not
                // fall into step and turn back into a single slide.
                transform: `translate(-50%, ${-hopHeight(elapsed)}px)`,
                color: `color-mix(in srgb, var(--color-miss) ${Math.round(100 - pct)}%, var(--color-accent))`,
              }}
            >
              <TumblingFigure elapsed={elapsed} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
