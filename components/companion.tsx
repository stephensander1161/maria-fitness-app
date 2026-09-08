"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isChromeless } from "@/lib/chromeless";
import {
  activityState, idlePose, nextActivity, setPose, thinkPose, travel, walkPose,
  type CompanionState,
} from "@/lib/companion";
import type { Joints } from "@/lib/movement-patterns";
import { wavePose } from "@/lib/companion";

/**
 * The coach, as somebody rather than a button.
 *
 * A chat bubble is a thing you use; this is a thing that is *there* — he
 * walks about, does sets between whatever else is happening, runs laps, and
 * waves. Tapping him opens the conversation, so he is also the way in.
 *
 * He reacts: while the coach is actually working he stops and thinks, which
 * is the only moment his behaviour means anything, and it means the thing it
 * looks like.
 *
 * Everything he does comes out of lib/companion.ts, which is pure and tested.
 * This file is the loop and the SVG.
 */
export function Companion() {
  const path = usePathname();
  const [state, setState] = useState<CompanionState>(() => activityState("walk", 0.5));
  const [pose, setPoseState] = useState<Joints>(() => idlePose(0));
  const [x, setX] = useState(50);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [busy, setBusy] = useState(false);
  /**
   * Whether this screen has somewhere to send her.
   *
   * Every screen but the owner's console carries an `AskCoach` panel, and
   * that panel — not a floating window — is this app's one coach entry point
   * per screen, because it knows what screen it is on. He leads her to it. On
   * the one screen without one he is still there, just not a button:
   * offering a tap that does nothing is worse than not offering it.
   */
  const [hasPanel, setHasPanel] = useState(false);
  useEffect(() => {
    // On the next frame, not synchronously: the panel is rendered by the page
    // and this lives in the layout, so on the first pass it is not there yet.
    const id = window.requestAnimationFrame(
      () => setHasPanel(Boolean(document.querySelector("[data-ask-coach]"))),
    );
    return () => window.cancelAnimationFrame(id);
  }, [path]);
  const started = useRef(0);
  const stateRef = useRef(state);
  // Written in an effect, not during render: a render can be thrown away, and
  // the loop below reads this every frame.
  useEffect(() => { stateRef.current = state; }, [state]);

  // The coach working is the one thing he reacts to. A custom event rather
  // than shared state: he lives at the bottom of the page and the thread
  // lives in a sheet above it, and neither should have to know about the
  // other to say "I am busy".
  useEffect(() => {
    // Stopping to think happens immediately rather than at the end of a lap,
    // which is the whole point of him reacting at all.
    const on = () => {
      setBusy(true);
      started.current = performance.now();
      const thinking = activityState("think", 0.5);
      stateRef.current = thinking;
      setState(thinking);
    };
    const off = () => setBusy(false);
    window.addEventListener("coach:busy", on);
    window.addEventListener("coach:idle", off);
    return () => {
      window.removeEventListener("coach:busy", on);
      window.removeEventListener("coach:idle", off);
    };
  }, []);

  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    started.current = performance.now();

    const frame = (now: number) => {
      const s = stateRef.current;
      const elapsed = (now - started.current) / 1000;

      if (elapsed > s.duration) {
        started.current = now;
        // Thinking is not chosen, it is caused: while the coach is working he
        // stops and thinks, and picks something up again when it stops.
        setState(busy ? activityState("think", 0.5) : nextActivity(s.activity, Math.random(), Math.random()));
      }

      const where = travel(s, elapsed);
      setX(where.x);
      setFacing(where.facing);

      const phase = (elapsed % 2) / 2;
      setPoseState(
        s.activity === "set" ? setPose(s.pattern, phase)
          : s.activity === "wave" ? wavePose(phase)
            : s.activity === "think" ? thinkPose(phase)
              : s.activity === "laps" ? walkPose(phase, true)
                : s.activity === "walk" ? walkPose(phase)
                  : idlePose(phase),
      );

      // One frame is enough when she has asked for less motion: he takes a
      // position and holds it, rather than disappearing.
      if (!still) raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [busy]);


  if (isChromeless(path)) return null;

  const label = busy ? "Your coach is thinking" : "Ask your coach";

  const Stage = hasPanel ? "button" : "div";
  return (
    <Stage
      {...(hasPanel
        ? {
          onClick: () => window.dispatchEvent(new CustomEvent("coach:open")),
          "aria-label": label,
          title: label,
        }
        : { "aria-hidden": true })}
      className={`group mt-6 block w-full rounded-2xl border border-line/60 bg-surface/40 px-2 py-1 ${
        hasPanel ? "transition-colors hover:bg-surface" : ""
      }`}
    >
      <svg viewBox="0 0 100 100" className="h-24 w-full text-accent/70 group-hover:text-accent" aria-hidden>
        {/* The ground he walks on. Faint: he is furniture, not a chart. */}
        <line x1="0" y1="96" x2="100" y2="96" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
        <g
          // The figure is drawn around x=50 in its own 100-wide box, so moving
          // him is a translate of the difference, and facing is a flip about
          // his own centre rather than about the stage.
          transform={`translate(${x - 50} 0) ${facing === -1 ? `translate(100 0) scale(-1 1)` : ""}`}
          style={{ transformOrigin: "50px 50px" }}
        >
          <Stick joints={pose} />
        </g>
      </svg>
      {hasPanel && <span className="sr-only">{label}</span>}
    </Stage>
  );
}

function Stick({ joints }: { joints: Joints }) {
  const { head, shoulder, elbow, hand, hip, knee, foot } = joints;
  const line = (a: [number, number], b: [number, number], key: string) => (
    <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
  );
  return (
    <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none">
      <circle cx={head[0]} cy={head[1]} r="6" strokeWidth="2.6" />
      {line(shoulder, hip, "spine")}
      {line(shoulder, elbow, "upperarm")}
      {line(elbow, hand, "forearm")}
      {line(hip, knee, "thigh")}
      {line(knee, foot, "shin")}
    </g>
  );
}
