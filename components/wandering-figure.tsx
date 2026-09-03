"use client";

import { useEffect, useRef, useState } from "react";
import { PATTERNS } from "@/lib/movement-patterns";

/**
 * The little wireframe figure, off the leash.
 *
 * It was built for the rest timer and spent its life on a four-pixel bar. Now
 * it tumbles around the whole window, bouncing off the edges and changing what
 * it is doing each time it lands one.
 *
 * Rules it has to keep, because a decoration that gets in the way is a bug:
 * it never takes a pointer event, it is never announced, it sits behind every
 * sheet and control, and it holds perfectly still for anyone who has asked for
 * less motion.
 */
const POSES = ["squat", "hinge", "lunge", "cardio", "rotation", "carry", "plank", "curl"] as const;

/** Pixels a second. Ambient, not distracting. */
const SPEED = 46;
const SIZE = 26;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPoint = (
  a: [number, number], b: [number, number], t: number,
): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const ease = (t: number) => t * t * (3 - 2 * t);

export function WanderingFigure() {
  const [frame, setFrame] = useState<{ x: number; y: number; spin: number; pose: number; t: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Start somewhere unremarkable and head off at an angle that is not 45°,
    // so it does not trace the same diagonal forever.
    let x = window.innerWidth * 0.2;
    let y = window.innerHeight * 0.7;
    const angle = 0.9;
    let dx = Math.cos(angle);
    let dy = -Math.sin(angle);
    let pose = 0;
    let poseT = 0;
    let spin = 0;
    let last = 0;
    let raf = 0;

    const step = (now: number) => {
      const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;

      x += dx * SPEED * dt;
      y += dy * SPEED * dt;

      const maxX = window.innerWidth - SIZE;
      const maxY = window.innerHeight - SIZE;
      let bounced = false;
      if (x <= 0) { x = 0; dx = Math.abs(dx); bounced = true; }
      if (x >= maxX) { x = maxX; dx = -Math.abs(dx); bounced = true; }
      if (y <= 0) { y = 0; dy = Math.abs(dy); bounced = true; }
      if (y >= maxY) { y = maxY; dy = -Math.abs(dy); bounced = true; }
      // A new thing to be doing, every time it lands an edge.
      if (bounced) { pose = (pose + 1) % POSES.length; poseT = 0; }

      poseT = Math.min(1, poseT + dt * 1.6);
      // Cartwheeling in the direction of travel.
      spin += dx * 210 * dt;

      setFrame({ x, y, spin, pose, t: poseT });
      raf = window.requestAnimationFrame(step);
    };

    raf = window.requestAnimationFrame(step);

    // A resized window must not leave it stranded outside the viewport.
    const onResize = () => {
      x = Math.min(x, window.innerWidth - SIZE);
      y = Math.min(y, window.innerHeight - SIZE);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (!frame) return null;

  const from = PATTERNS[POSES[frame.pose]] ?? PATTERNS.squat;
  const to = PATTERNS[POSES[(frame.pose + 1) % POSES.length]] ?? PATTERNS.squat;
  const t = ease(frame.t);
  const j = {
    head: lerpPoint(from.end.head, to.end.head, t),
    shoulder: lerpPoint(from.end.shoulder, to.end.shoulder, t),
    elbow: lerpPoint(from.end.elbow, to.end.elbow, t),
    hand: lerpPoint(from.end.hand, to.end.hand, t),
    hip: lerpPoint(from.end.hip, to.end.hip, t),
    knee: lerpPoint(from.end.knee, to.end.knee, t),
    foot: lerpPoint(from.end.foot, to.end.foot, t),
  };
  const line = (a: [number, number], b: [number, number]) => `M${a[0]},${a[1]}L${b[0]},${b[1]}`;

  return (
    <span
      ref={box}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-10 text-accent/45"
      style={{ transform: `translate3d(${frame.x}px, ${frame.y}px, 0) rotate(${frame.spin}deg)` }}
    >
      <svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
        <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <circle cx={j.head[0]} cy={j.head[1]} r="7" fill="currentColor" stroke="none" />
          <path d={line(j.shoulder, j.hip)} />
          <path d={line(j.shoulder, j.elbow)} />
          <path d={line(j.elbow, j.hand)} />
          <path d={line(j.hip, j.knee)} />
          <path d={line(j.knee, j.foot)} />
        </g>
      </svg>
    </span>
  );
}
