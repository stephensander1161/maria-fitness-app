"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isChromeless } from "@/lib/chromeless";
import {
  activityState, cartwheelPose, cartwheelSpin, celebratePose, idlePose, nextActivity, phaseFor,
  reactionFor, setPose, stridePose, thinkPose, travel, unimpressedPose, wavePose,
  type Activity, type CompanionState, type Pose, type Tone,
} from "@/lib/companion";

/**
 * The coach, as somebody rather than a button.
 *
 * A chat bubble is a thing you use; this is a thing that is *there* — he
 * walks about, does sets between whatever else is happening, runs laps, and
 * waves. Tapping him opens the coach for whichever screen she is on.
 *
 * He reacts to two things, and only two, because a figure that reacts to
 * everything is noise: the coach actually working (he stops and thinks), and
 * a set landing (he is pleased, or he is not — see reactionFor, which reads
 * the same tone the coach speaks in).
 *
 * **Nothing here re-renders per frame.** The first version called setState
 * sixty times a second and the whole component tree went with it, which is
 * exactly what "janky" was. The loop now writes SVG attributes straight to
 * the DOM through refs; React only hears about it when the *activity*
 * changes, which is every few seconds.
 */
export function Companion({ tone = "plain" }: { tone?: Tone }) {
  const path = usePathname();
  const [hasPanel, setHasPanel] = useState(false);
  const [busy, setBusy] = useState(false);

  const root = useRef<SVGGElement>(null);
  // The limbs are found once, from the group, by their data attribute. A ref
  // per line meant a ref callback created during render for each of ten
  // elements — which React reattaches every render and the compiler rightly
  // refuses to let you read from.
  const parts = useRef<Record<string, SVGElement>>({});
  // The loop reads these; nothing outside it does. Refs rather than state so
  // that changing them costs nothing.
  const state = useRef<CompanionState>(activityState("walk", 0.5));
  const startedAt = useRef(0);
  const busyRef = useRef(false);
  const toneRef = useRef<Tone>(tone);
  // Written in an effect, not during render: a render can be thrown away, and
  // the frame loop reads this.
  useEffect(() => { toneRef.current = tone; }, [tone]);

  useEffect(() => {
    const id = window.requestAnimationFrame(
      () => setHasPanel(Boolean(document.querySelector("[data-ask-coach]"))),
    );
    return () => window.cancelAnimationFrame(id);
  }, [path]);

  /** Drop whatever he was doing and start this instead. */
  function interrupt(activity: Activity) {
    state.current = activityState(activity, Math.random());
    startedAt.current = performance.now();
  }

  useEffect(() => {
    const busyOn = () => { busyRef.current = true; setBusy(true); interrupt("think"); };
    const busyOff = () => { busyRef.current = false; setBusy(false); };
    const onSet = (e: Event) => {
      const d = (e as CustomEvent<{ vs: "first" | "beat" | "matched" | "missed"; rir: number | null }>).detail;
      if (!d) return;
      interrupt(reactionFor(d.vs, d.rir ?? null, toneRef.current));
    };
    window.addEventListener("coach:busy", busyOn);
    window.addEventListener("coach:idle", busyOff);
    window.addEventListener("coach:set", onSet);
    return () => {
      window.removeEventListener("coach:busy", busyOn);
      window.removeEventListener("coach:idle", busyOff);
      window.removeEventListener("coach:set", onSet);
    };
  }, []);

  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    startedAt.current = performance.now();

    /**
     * Re-found whenever they are not on the page any more.
     *
     * Doing this once on mount was the bug that left him as a head and
     * nothing else: anything that remounts the svg — and this component
     * swapped its own wrapper element the moment it worked out whether the
     * screen had a coach panel — leaves these pointing at detached nodes,
     * and the loop then draws happily into a document fragment for ever.
     */
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
      g.setAttribute(
        "transform",
        `translate(${x - 50} 0)${facing === -1 ? " translate(100 0) scale(-1 1)" : ""}`
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

      // Where he had got to, so the next thing starts from there rather than
      // teleporting him back to the middle of the stage.
      const where0 = travel(s, elapsed);
      if (elapsed > s.duration) {
        startedAt.current = now;
        // Thinking is not chosen, it is caused: he goes back to pottering
        // about only when the coach has stopped working.
        state.current = busyRef.current
          ? activityState("think", 0.5, where0.x)
          : nextActivity(s.activity, Math.random(), Math.random(), where0.x);
      }

      const where = travel(state.current, elapsed);
      const a = state.current.activity;
      const phase = phaseFor(a, elapsed);
      draw(
        a === "cartwheel" ? cartwheelPose(phase)
          : a === "set" ? setPose(state.current.pattern, phase)
          : a === "wave" ? wavePose(phase)
            : a === "celebrate" ? celebratePose(phase)
              : a === "unimpressed" ? unimpressedPose(phase)
                : a === "think" ? thinkPose(phase)
                  : a === "laps" ? stridePose(phase, 1.9)
                    : a === "walk" ? stridePose(phase)
                      : idlePose(phase),
        where.x, where.facing,
        // The only thing that turns over. Multiplied by the facing so a
        // cartwheel back the other way goes round the other way.
        a === "cartwheel" ? cartwheelSpin(phase) * where.facing : 0,
      );

      // One frame is enough when she has asked for less motion: he takes a
      // position and holds it, rather than disappearing.
      if (!still) raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  if (isChromeless(path)) return null;

  const label = busy ? "Your coach is thinking" : "Ask your coach";
  // Always a button, never sometimes a div: changing the element type
  // remounts everything inside it, which is what detached the figure from the
  // loop drawing it and left him as a motionless head.
  return (
    <button
      type="button"
      {...(hasPanel
        ? {
          onClick: () => window.dispatchEvent(new CustomEvent("coach:open")),
          "aria-label": label,
          title: label,
        }
        : { "aria-hidden": true, tabIndex: -1 })}
      className={`group mt-6 block w-full rounded-2xl border border-line/60 bg-surface/40 px-2 py-1 ${
        hasPanel ? "transition-colors hover:bg-surface" : ""
      }`}
    >
      <svg viewBox="0 0 100 100" className="h-24 w-full text-accent/70 group-hover:text-accent" aria-hidden>
        {/* The ground he walks on. Faint: he is furniture, not a chart. */}
        <line x1="0" y1="96" x2="100" y2="96" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
        <g ref={root} stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none">
          {/* The far arm and leg sit behind, a shade lighter, so a stride
              reads as two of each rather than as one thick one. */}
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
      </svg>
      {hasPanel && <span className="sr-only">{label}</span>}
    </button>
  );
}
