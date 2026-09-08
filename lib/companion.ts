import { PATTERNS, type Joints, type PatternKey } from "@/lib/movement-patterns";

/**
 * The little figure that lives at the bottom of the screen.
 *
 * He is the coach's face — tapping him opens the conversation — but most of
 * the time he is just there, training. The app already had a skeleton and a
 * set of movement patterns for the exercise thumbnails; this makes them walk
 * around.
 *
 * All of it is pure: poses are functions of a phase between 0 and 1, and what
 * he does next is a function of what he was doing and a random number. That
 * is what makes a wandering figure testable at all — the alternative is a
 * component full of timers that can only be checked by watching it.
 */

export type Activity = "walk" | "laps" | "set" | "wave" | "think" | "idle";

/** Where he is and what he is doing. `x` is 0–100 across the stage. */
export type CompanionState = {
  activity: Activity;
  /** Seconds this activity runs for. */
  duration: number;
  x: number;
  /** Where he is heading, for the activities that travel. */
  toX: number;
  /** 1 facing right, -1 facing left. */
  facing: 1 | -1;
  /** The movement he is doing, when the activity is `set`. */
  pattern: PatternKey;
};

const MOVES: PatternKey[] = ["squat", "lunge", "curl", "raise", "punch", "hinge", "rotation"];

/**
 * What he does next.
 *
 * Weighted rather than uniform: mostly he wanders, because a figure that
 * changes what it is doing every two seconds reads as a glitch rather than as
 * someone pottering about. He never repeats the activity he has just
 * finished, which is what stops him doing four sets of squats in a row while
 * standing still.
 */
export function nextActivity(previous: Activity, roll: number, roll2 = 0.5): CompanionState {
  const table: [Activity, number][] = [
    ["walk", 0.34],
    ["set", 0.24],
    ["laps", 0.18],
    ["idle", 0.14],
    ["wave", 0.10],
  ];
  const choices = table.filter(([a]) => a !== previous);
  const total = choices.reduce((n, [, w]) => n + w, 0);
  let at = Math.max(0, Math.min(0.999, roll)) * total;
  let picked: Activity = choices[0][0];
  for (const [activity, weight] of choices) {
    if (at < weight) { picked = activity; break; }
    at -= weight;
  }
  return activityState(picked, roll2);
}

/** The shape of one activity: how long it runs and where it goes. */
export function activityState(activity: Activity, roll: number): CompanionState {
  const r = Math.max(0, Math.min(0.999, roll));
  const base = { activity, x: 50, toX: 50, facing: 1 as 1 | -1, pattern: "squat" as PatternKey };
  switch (activity) {
    case "walk":
      // Somewhere else on the stage, at a stroll.
      return { ...base, duration: 4 + r * 4, toX: 8 + r * 84 };
    case "laps":
      // Track and field: end to end and back, several times.
      return { ...base, duration: 7 + r * 5, toX: 92 };
    case "set":
      return { ...base, duration: 6 + r * 4, pattern: MOVES[Math.floor(r * MOVES.length)] };
    case "wave":
      return { ...base, duration: 2.5 };
    case "think":
      return { ...base, duration: 3 };
    default:
      return { ...base, duration: 3 + r * 3 };
  }
}

/* ------------------------------------------------------------- poses --- */

const STAND: Joints = {
  head: [50, 15], shoulder: [50, 28], elbow: [50, 42], hand: [50, 55],
  hip: [50, 55], knee: [50, 75], foot: [50, 94],
};

const at = (p: [number, number], dx: number, dy: number): [number, number] => [p[0] + dx, p[1] + dy];

/** Sine between -1 and 1 for a phase in 0–1. */
const swing = (phase: number, cycles = 1) => Math.sin(phase * cycles * Math.PI * 2);

/**
 * Walking: legs and arms out of phase, and a small vertical bob. One leg and
 * one arm is all a stick figure has, so the swing has to read as a stride on
 * its own — which means a longer throw than a real leg makes.
 */
export function walkPose(phase: number, running = false): Joints {
  const s = swing(phase, running ? 3 : 2);
  const reach = running ? 16 : 10;
  const bob = Math.abs(swing(phase, running ? 6 : 4)) * (running ? 2.5 : 1.4);
  const lean = running ? 4 : 1;
  return {
    head: at(STAND.head, lean, -bob),
    shoulder: at(STAND.shoulder, lean * 0.7, -bob),
    elbow: at(STAND.elbow, -s * reach * 0.5, -bob + 2),
    hand: at(STAND.hand, -s * reach, -bob - 2),
    hip: at(STAND.hip, 0, -bob),
    knee: at(STAND.knee, s * reach * 0.6, -bob - Math.abs(s) * 3),
    foot: at(STAND.foot, s * reach, -Math.abs(s) * (running ? 8 : 4)),
  };
}

/** Standing, breathing. */
export function idlePose(phase: number): Joints {
  const b = swing(phase, 1) * 0.8;
  return {
    ...STAND,
    head: at(STAND.head, 0, -b),
    shoulder: at(STAND.shoulder, 0, -b * 0.8),
    elbow: at(STAND.elbow, 2, -b * 0.4),
    hand: at(STAND.hand, 3, 0),
  };
}

/** An arm up, waving from the elbow. */
export function wavePose(phase: number): Joints {
  const w = swing(phase, 3);
  return {
    ...STAND,
    elbow: [58, 30],
    hand: [62 + w * 7, 18 + Math.abs(w) * 2],
  };
}

/** Hand to the chin, weight on one leg, a slow nod. */
export function thinkPose(phase: number): Joints {
  const n = swing(phase, 0.75);
  return {
    ...STAND,
    head: at(STAND.head, n * 1.5, 0),
    elbow: [58, 44],
    hand: [53, 22],
    knee: [52, 75],
    foot: [54, 94],
  };
}

/** One rep of a movement: out to the end pose and back, twice a second. */
export function setPose(pattern: PatternKey, phase: number): Joints {
  const p = PATTERNS[pattern] ?? PATTERNS.squat;
  // A triangle wave, not a sine: a rep has a bottom and a top, and easing
  // through both makes it float.
  const t = 1 - Math.abs(((phase * 4) % 2) - 1);
  const ease = t * t * (3 - 2 * t);
  return lerpJoints(p.start, p.end, ease);
}

export function lerpJoints(a: Joints, b: Joints, t: number): Joints {
  const one = (p: [number, number], q: [number, number]): [number, number] =>
    [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  return {
    head: one(a.head, b.head), shoulder: one(a.shoulder, b.shoulder),
    elbow: one(a.elbow, b.elbow), hand: one(a.hand, b.hand),
    hip: one(a.hip, b.hip), knee: one(a.knee, b.knee), foot: one(a.foot, b.foot),
  };
}

/**
 * Where he is along a journey, and which way he is facing.
 *
 * Laps bounce: he runs to the far end, turns, and runs back, for as long as
 * the activity lasts. Everything else walks once and stays.
 */
export function travel(state: CompanionState, elapsed: number): { x: number; facing: 1 | -1 } {
  const { activity, x, toX, duration } = state;
  if (activity !== "walk" && activity !== "laps") return { x, facing: state.facing };

  if (activity === "walk") {
    const t = Math.max(0, Math.min(1, elapsed / duration));
    return { x: x + (toX - x) * t, facing: toX >= x ? 1 : -1 };
  }

  // A lap every four seconds, ping-ponging between the ends of the stage.
  const LAP_S = 4;
  const cycle = (elapsed % (LAP_S * 2)) / LAP_S;
  const out = cycle <= 1;
  const t = out ? cycle : 2 - cycle;
  return { x: 8 + (92 - 8) * t, facing: out ? 1 : -1 };
}
