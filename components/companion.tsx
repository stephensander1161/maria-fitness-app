"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isChromeless } from "@/lib/chromeless";
import {
  activityState, cartwheelPose, cartwheelSpin, celebratePose, CROWD, idlePose, nextActivity,
  phaseFor, reactionFor, setPose, stridePose, thinkPose, travel, unimpressedPose, wavePose,
  type Activity, type CompanionState, type Pose, type Tone,
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
const CREW_KEY = "coach.crew";
/** Enough to be silly, few enough to still be a stage rather than a crowd. */
const MAX_CREW = 25;

export function Companion({ tone = "plain" }: { tone?: Tone }) {
  const path = usePathname();
  const [hasPanel, setHasPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * How many of him there are.
   *
   * Kept in this browser: it is a preference about how busy the bottom of
   * the screen is and nothing else. It goes down to none, deliberately — if
   * he is annoying, the answer has to be that he can go.
   */
  const [crew, setCrew] = useState(1);

  useEffect(() => {
    // On the next frame, not synchronously: reading storage during the first
    // effect pass sets state before the first paint has landed.
    const id = window.requestAnimationFrame(() => {
      try {
        const saved = Number(window.localStorage.getItem(CREW_KEY));
        if (Number.isFinite(saved) && saved >= 0 && saved <= MAX_CREW) setCrew(saved);
      } catch { /* private mode — one of him, then */ }
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  function setCrewSaved(n: number) {
    const next = Math.max(0, Math.min(MAX_CREW, n));
    setCrew(next);
    try { window.localStorage.setItem(CREW_KEY, String(next)); } catch { /* fine */ }
  }

  useEffect(() => {
    const id = window.requestAnimationFrame(
      () => setHasPanel(Boolean(document.querySelector("[data-ask-coach]"))),
    );
    return () => window.cancelAnimationFrame(id);
  }, [path]);

  useEffect(() => {
    const on = () => setBusy(true);
    const off = () => setBusy(false);
    window.addEventListener("coach:busy", on);
    window.addEventListener("coach:idle", off);
    return () => {
      window.removeEventListener("coach:busy", on);
      window.removeEventListener("coach:idle", off);
    };
  }, []);

  if (isChromeless(path)) return null;

  const label = busy ? "Your coach is thinking" : "Ask your coach";

  return (
    <div className="relative mt-6 rounded-2xl border border-line/60 bg-surface/40">
      {/* The strip itself is the way in to the coach. The two little buttons
          sit on top of it and stop the tap reaching it. */}
      <button
        type="button"
        {...(hasPanel
          ? { onClick: () => window.dispatchEvent(new CustomEvent("coach:open")), "aria-label": label, title: label }
          : { "aria-hidden": true, tabIndex: -1 })}
        className={`group block w-full px-2 py-1 ${hasPanel ? "transition-colors hover:bg-surface/60" : ""}`}
      >
        <svg
          viewBox={`0 0 ${STAGE_W} 100`}
          preserveAspectRatio="xMidYMax meet"
          className="h-24 w-full text-accent/70 group-hover:text-accent"
          aria-hidden
        >
          {/* The ground he walks on. Faint: he is furniture, not a chart. */}
          <line x1="0" y1="96" x2={STAGE_W} y2="96" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
          {Array.from({ length: crew }, (_, i) => (
            <Walker key={i} index={i} tone={tone} busy={busy} crowded={crew >= CROWD} />
          ))}
        </svg>
        {hasPanel && <span className="sr-only">{label}</span>}
      </button>

      {/* Bottom corners of his world: one fewer, one more. */}
      <button
        type="button"
        onClick={() => setCrewSaved(crew - 1)}
        disabled={crew === 0}
        aria-label="One fewer"
        className="absolute bottom-1 left-1 grid size-7 place-items-center rounded-full text-[15px] leading-none text-faint transition-colors hover:bg-raised hover:text-muted disabled:opacity-25"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => setCrewSaved(crew + 1)}
        disabled={crew >= MAX_CREW}
        aria-label="One more"
        className="absolute bottom-1 right-1 grid size-7 place-items-center rounded-full text-[15px] leading-none text-faint transition-colors hover:bg-raised hover:text-muted disabled:opacity-25"
      >
        +
      </button>
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
  index, tone, busy, crowded,
}: { index: number; tone: Tone; busy: boolean; crowded: boolean }) {
  const root = useRef<SVGGElement>(null);
  const parts = useRef<Record<string, SVGElement>>({});
  const state = useRef<CompanionState>(activityState("walk", (index * 0.37) % 1, 20 + ((index * 29) % 60)));
  const startedAt = useRef(0);
  const busyRef = useRef(false);
  const toneRef = useRef<Tone>(tone);
  const crowdedRef = useRef(crowded);

  useEffect(() => { toneRef.current = tone; }, [tone]);
  useEffect(() => { crowdedRef.current = crowded; }, [crowded]);

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
      g.setAttribute(
        "transform",
        `translate(${at - 50} 0)${facing === -1 ? " translate(100 0) scale(-1 1)" : ""}`
        + (spin ? ` rotate(${spin} 50 58)` : ""),
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
          : nextActivity(s.activity, Math.random(), Math.random(), where0.x, crowdedRef.current);
      }

      const where = travel(state.current, elapsed);
      const a = state.current.activity;
      const phase = phaseFor(a, elapsed);
      draw(
        a === "cartwheel" ? cartwheelPose(phase)
          : a === "set" || a === "spar" ? setPose(state.current.pattern, phase)
            : a === "wave" ? wavePose(phase)
              : a === "celebrate" ? celebratePose(phase)
                : a === "unimpressed" ? unimpressedPose(phase)
                  : a === "think" ? thinkPose(phase)
                    : a === "laps" ? stridePose(phase, 1.9)
                      : a === "walk" ? stridePose(phase)
                        : idlePose(phase),
        where.x, where.facing,
        a === "cartwheel" ? cartwheelSpin(phase) * where.facing : 0,
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
