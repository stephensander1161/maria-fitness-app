"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isChromeless } from "@/lib/chromeless";
import {
  activityState, celebratePose, idlePose, nextActivity, phaseFor, reactionFor, setPose,
  sleepPose, stridePose, thinkPose, travel, unimpressedPose, wavePose,
  type Activity, type CompanionState, type Mode, type Pose, type Tone,
} from "@/lib/companion";

/**
 * The coach, as somebody rather than a button.
 *
 * A chat bubble is a thing you use; this is a thing that is *there* — he
 * walks about, does sets between whatever else is happening, runs laps,
 * cartwheels, and waves. Tapping the strip opens the coach for whichever
 * screen she is on.
 *
 * He reacts to two things, and only two, because a figure that reacts to
 * everything is noise: the coach actually working (he stops and thinks), and
 * a set landing (he is pleased, or he is not — see reactionFor, which reads
 * the same tone the coach speaks in).
 *
 * **Nothing here re-renders per frame.** Each figure writes SVG attributes
 * straight to the DOM through a ref; React only hears about it when the
 * activity changes, which is every few seconds.
 */

/** The stage is wide and short, so he has a floor rather than a square. */
const STAGE_W = 300;

export function Companion({
  tone = "plain", scale = 1, fullness = null, bark = null, barkKind = "idle", mode = "about",
}: {
  tone?: Tone;
  /**
   * Training, up and about, or asleep — decided on the server from her clock
   * and her session, then corrected here the instant she presses Start.
   */
  mode?: Mode;
  /** How big he is, from what she has trained this fortnight. See lib/buddy. */
  scale?: number;
  /** Today's protein against target, 0–1. Null when it cannot honestly be said. */
  fullness?: number | null;
  /** The one line he has to say, chosen by what is true. */
  bark?: string | null;
  barkKind?: "protein" | "training" | "weigh-in" | "praise" | "idle";
}) {
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  /**
   * The server decided this when the page rendered; these two events are what
   * make it true *now*.
   *
   * Pressing Start refreshes the route, but a round trip is a second or two
   * and the whole promise is that he joins in when she starts. He is on his
   * feet before the refresh lands.
   */
  const [live, setLive] = useState<Mode | null>(null);

  useEffect(() => {
    const on = () => setBusy(true);
    const off = () => setBusy(false);
    const started = () => setLive("training");
    const ended = () => setLive(null);
    window.addEventListener("coach:busy", on);
    window.addEventListener("coach:idle", off);
    window.addEventListener("workout:started", started);
    window.addEventListener("workout:finished", ended);
    return () => {
      window.removeEventListener("coach:busy", on);
      window.removeEventListener("coach:idle", off);
      window.removeEventListener("workout:started", started);
      window.removeEventListener("workout:finished", ended);
    };
  }, []);
  // A fresh render from the server is the authority again: `live` only exists
  // to cover the gap while that render is in flight.
  const showing: Mode = mode === "training" ? "training" : (live ?? mode);

  if (isChromeless(path)) return null;

  const label = busy ? "Your coach is thinking" : "Ask your coach";
  const hungry = fullness !== null && fullness < 0.7;

  return (
    <div className="tap-only relative mt-6 overflow-hidden rounded-2xl border border-line/60 bg-surface/40">
      {/*
        One of him.
        He was briefly a crowd with buttons to add and remove, which was funny
        for a day and then was a row of strangers doing star jumps under her
        session. One figure can mean something: he is the size of her fortnight
        and he says the one thing most worth saying.
      */}
      <button
        type="button"
        // Named, because the floating coach button carries the same label and
        // a probe cannot otherwise tell the two apart.
        data-companion=""
        onClick={() => window.dispatchEvent(new CustomEvent("coach:open"))}
        aria-label={label}
        title={label}
        className="tap-only group block w-full px-2 pt-1 transition-colors hover:bg-surface/60"
      >
        <svg
          viewBox={`0 0 ${STAGE_W} 100`}
          preserveAspectRatio="xMidYMax meet"
          className="h-24 w-full text-accent/70 group-hover:text-accent"
          aria-hidden
        >
          {/* The ground he walks on. Faint: he is furniture, not a chart. */}
          <line x1="0" y1="96" x2={STAGE_W} y2="96" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
          <Walker index={0} tone={tone} busy={busy} crowded={false} scale={scale} mode={showing} />
        </svg>
        {/*
          No text inside the button.
          The screen-reader label used to live here as a real <span>, and iOS
          reads a press-and-hold on real text as a selection: the Copy /
          Search callout came up over the strip and swallowed the tap. The
          `aria-label` above says the same thing to the same people without
          putting anything on the page to select.
        */}
      </button>

      {/*
        What he has to say, and how fed he is.
        Outside the button, because "Feed" goes somewhere else and a link
        inside a button is not a thing. The line is never random — it is
        whichever true thing most needed saying, see lib/buddy.ts.
      */}
      <div className="flex items-center gap-2 border-t border-line/50 px-3 py-2">
        <p className={`min-w-0 flex-1 truncate text-[12px] ${
          barkKind === "praise" ? "text-beat" : barkKind === "idle" ? "text-faint" : "text-muted"
        }`}>
          {bark}
        </p>
        {/* Only offered when there is something to fix. A Feed button on a day
            she has already hit her protein is a button that does nothing. */}
        {hungry && (
          <Link
            href="/eat"
            className="shrink-0 rounded-full border border-edge px-2.5 py-1 text-[11px] font-medium text-muted active:bg-raised"
          >
            Feed
          </Link>
        )}
      </div>

      {/*
        How full he is, as a line rather than a number: the grams are on Eat,
        said properly and with the floor spelled out when some of the day was
        typed in words. Hidden entirely when it cannot be said — an empty bar
        reads as zero, and nothing logged is not zero protein.
      */}
      {fullness !== null && (
        <div
          className="h-1 w-full bg-raised"
          role="img"
          aria-label={`Protein today, about ${Math.round(fullness * 100)} percent of target`}
        >
          <div
            className={`h-full transition-all duration-500 ${fullness >= 1 ? "bg-beat" : "bg-accent"}`}
            style={{ width: `${Math.round(fullness * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One figure, running its own loop.
 *
 * Each has its own state and its own frame callback, so a crowd is a crowd
 * of individuals rather than one animation drawn six times — they start on
 * different activities and drift apart within seconds.
 */
/**
 * A hue each, so a crowd is a crowd of people rather than one figure printed
 * six times. The first keeps the app's own accent — he is the coach, and
 * changing colour when a friend turns up would read as a different person.
 * The rest are spread evenly round the wheel at one saturation and lightness,
 * which is what stops it looking like a bag of highlighters.
 */
function hueFor(index: number): string | undefined {
  if (index === 0) return undefined;
  return `hsl(${(index * 47) % 360} 70% 62%)`;
}

function Walker({
  index, tone, busy, crowded, scale = 1, mode = "about",
}: {
  index: number; tone: Tone; busy: boolean; crowded: boolean;
  /** Training, up and about, or asleep — see lib/companion.ts. */
  mode?: Mode;
  /**
   * How big he is drawn, from what she has actually trained this fortnight.
   *
   * Applied here in the transform rather than on the <svg>, so his feet stay
   * on the same floor as he grows — scaling the whole stage would lift him
   * off the ground or sink him through it.
   */
  scale?: number;
}) {
  const root = useRef<SVGGElement>(null);
  const parts = useRef<Record<string, SVGElement>>({});
  const state = useRef<CompanionState>(activityState("walk", (index * 0.37) % 1, 20 + ((index * 29) % 60)));
  const startedAt = useRef(0);
  const busyRef = useRef(false);
  const toneRef = useRef<Tone>(tone);
  const crowdedRef = useRef(crowded);
  const scaleRef = useRef(scale);
  const modeRef = useRef<Mode>(mode);

  useEffect(() => { toneRef.current = tone; }, [tone]);
  useEffect(() => { crowdedRef.current = crowded; }, [crowded]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  /**
   * A change of mode interrupts whatever he was doing.
   *
   * Without this he finishes his forty-second nap before noticing she has
   * started a workout, which is exactly the moment he is supposed to be
   * paying attention.
   */
  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    interrupt(mode === "asleep" ? "sleep" : mode === "training" ? "set" : "walk");
  }, [mode]);

  function interrupt(activity: Activity) {
    const where = travel(state.current, (performance.now() - startedAt.current) / 1000);
    state.current = activityState(activity, Math.random(), where.x);
    startedAt.current = performance.now();
  }

  useEffect(() => {
    busyRef.current = busy;
    if (busy) interrupt("think");
  }, [busy]);

  useEffect(() => {
    const onSet = (e: Event) => {
      const d = (e as CustomEvent<{ vs: "first" | "beat" | "matched" | "missed"; rir: number | null }>).detail;
      if (!d) return;
      interrupt(reactionFor(d.vs, d.rir ?? null, toneRef.current));
    };
    window.addEventListener("coach:set", onSet);
    return () => window.removeEventListener("coach:set", onSet);
  }, []);

  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    // Staggered, so a crew does not move as one body.
    startedAt.current = performance.now() - index * 900;

    const limbs = () => {
      const g = root.current;
      if (!g) return null;
      if (!parts.current.spine?.isConnected) {
        parts.current = {};
        for (const el of g.querySelectorAll<SVGElement>("[data-part]")) {
          parts.current[el.dataset.part!] = el;
        }
      }
      return g;
    };

    const draw = (pose: Pose, x: number, facing: 1 | -1, spin: number) => {
      const g = limbs();
      if (!g) return;
      // His own box is 100 wide; the stage is three times that, so he walks
      // the whole floor rather than a square in the middle of it.
      const at = x * (STAGE_W / 100);
      // Scaled about his feet (y = 96, the floor), so a bigger figure stands
      // taller rather than hovering above the line or sinking through it.
      const k = scaleRef.current;
      g.setAttribute(
        "transform",
        `translate(${at - 50} 0)${facing === -1 ? " translate(100 0) scale(-1 1)" : ""}`
        + (spin ? ` rotate(${spin} 50 58)` : "")
        + (k === 1 ? "" : ` translate(50 96) scale(${k}) translate(-50 -96)`),
      );
      const set = (key: string, attrs: Record<string, number>) => {
        const el = parts.current[key];
        if (!el) return;
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      };
      set("head", { cx: pose.head[0], cy: pose.head[1] });
      set("spine", { x1: pose.shoulder[0], y1: pose.shoulder[1], x2: pose.hip[0], y2: pose.hip[1] });
      for (const [side, arm] of [["L", pose.armL], ["R", pose.armR]] as const) {
        set(`upperarm${side}`, { x1: pose.shoulder[0], y1: pose.shoulder[1], x2: arm.elbow[0], y2: arm.elbow[1] });
        set(`forearm${side}`, { x1: arm.elbow[0], y1: arm.elbow[1], x2: arm.hand[0], y2: arm.hand[1] });
      }
      for (const [side, leg] of [["L", pose.legL], ["R", pose.legR]] as const) {
        set(`thigh${side}`, { x1: pose.hip[0], y1: pose.hip[1], x2: leg.knee[0], y2: leg.knee[1] });
        set(`shin${side}`, { x1: leg.knee[0], y1: leg.knee[1], x2: leg.foot[0], y2: leg.foot[1] });
      }
    };

    const frame = (now: number) => {
      const s = state.current;
      const elapsed = (now - startedAt.current) / 1000;
      const where0 = travel(s, elapsed);

      if (elapsed > s.duration) {
        startedAt.current = now;
        state.current = busyRef.current
          ? activityState("think", 0.5, where0.x)
          : nextActivity(s.activity, Math.random(), Math.random(), where0.x, crowdedRef.current, modeRef.current);
      }

      const where = travel(state.current, elapsed);
      const a = state.current.activity;
      const phase = phaseFor(a, elapsed);
      draw(
        a === "sleep" ? sleepPose(phase)
          : a === "set" || a === "spar" ? setPose(state.current.pattern, phase)
            : a === "wave" ? wavePose(phase)
              : a === "celebrate" ? celebratePose(phase)
                : a === "unimpressed" ? unimpressedPose(phase)
                  : a === "think" ? thinkPose(phase)
                    : a === "laps" ? stridePose(phase, 1.9)
                      : a === "walk" ? stridePose(phase)
                        : idlePose(phase),
        where.x, where.facing, 0,
      );

      if (!still) raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [index]);

  return (
    <g
      ref={root}
      style={{ color: hueFor(index) }}
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    >
      {/* The far arm and leg sit behind, a shade lighter, so a stride reads
          as two of each rather than as one thick one. */}
      <g opacity="0.55">
        <line data-part="upperarmL" />
        <line data-part="forearmL" />
        <line data-part="thighL" />
        <line data-part="shinL" />
      </g>
      <circle data-part="head" cx="50" cy="15" r="6" strokeWidth="2.6" />
      <line data-part="spine" />
      <line data-part="upperarmR" />
      <line data-part="forearmR" />
      <line data-part="thighR" />
      <line data-part="shinR" />
    </g>
  );
}
