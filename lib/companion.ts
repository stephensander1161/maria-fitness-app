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

export type Activity =
  | "walk" | "laps" | "set" | "wave" | "think" | "idle" | "celebrate" | "unimpressed"
  /** Out cold on the floor. What he does at night, and between sessions. */
  | "sleep"
  /** Shadow-boxing. What a crowded floor turns into. */
  | "spar";

/**
 * What he is up to, which is decided by what *she* is up to.
 *
 * The one rule that overrides everything: **a session running means he
 * trains.** Not at three in the morning, not on a rest day, not while he was
 * asleep a second ago — if she has started a workout he is doing it with her,
 * because that is the only moment he is company rather than decoration.
 *
 * Otherwise he sleeps, unless it is daytime and there is a reason to be up.
 * He does not do sets when she is not training: reps performed at nobody is
 * the difference between a companion and a screensaver.
 */
export type Mode = "training" | "about" | "asleep";

/** The three registers the app already speaks in — profiles.coach_tone. */
export type Tone = "encouraging" | "plain" | "hype";

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
export function nextActivity(
  previous: Activity,
  roll: number,
  roll2 = 0.5,
  fromX = 50,
  /**
   * Too many of them on one floor.
   *
   * Past a certain crowd nobody has room to run laps or turn a cartwheel, so
   * it turns into a boxing gym: mostly shadow-boxing, with the odd set. It
   * is a joke, but it is also the honest thing for the space — figures
   * cartwheeling through each other looks broken, and figures throwing jabs
   * on the spot looks deliberate.
   */
  crowded = false,
  mode: Mode = "about",
): CompanionState {
  // Asleep is not one activity among several. There is nothing to weight and
  // nothing to pick: he is asleep until something wakes him.
  if (mode === "asleep") return activityState("sleep", roll2, fromX);

  const table: [Activity, number][] = crowded
    ? [
      ["spar", 0.62],
      ["set", 0.18],
      ["idle", 0.12],
      ["wave", 0.08],
    ]
    : mode === "training"
      // She is in a session, so he is in a session. Mostly sets, with just
      // enough else that he is a person doing them rather than a loop.
      ? [
        ["set", 0.66],
        ["walk", 0.14],
        ["idle", 0.10],
        ["wave", 0.10],
      ]
      // Up and about, and pointedly not doing sets: reps performed at nobody
      // is the difference between a companion and a screensaver.
      : [
        ["walk", 0.42],
        ["laps", 0.24],
        ["idle", 0.20],
        ["wave", 0.14],
      ];
  const choices = table.filter(([a]) => a !== previous);
  const total = choices.reduce((n, [, w]) => n + w, 0);
  let at = Math.max(0, Math.min(0.999, roll)) * total;
  let picked: Activity = choices[0][0];
  for (const [activity, weight] of choices) {
    if (at < weight) { picked = activity; break; }
    at -= weight;
  }
  return activityState(picked, roll2, fromX);
}

/**
 * How he takes the set she just logged.
 *
 * The two things the app knows the moment a set lands: how it compared with
 * last time, and how much she said was left in the tank. Three or more left
 * is coasting; nothing left on a set that went backwards is not.
 *
 * The tone decides how hard he is about it, and it is the same tone the coach
 * speaks in — `hype` is the gym floor, and it is the only one that gets
 * visibly unimpressed at a set that was merely *fine*. None of them is ever
 * unimpressed at a first attempt: there is nothing to compare it to, and
 * meeting a new movement with a shrug is how someone stops trying new ones.
 */
export function reactionFor(
  vs: "first" | "beat" | "matched" | "missed",
  rir: number | null,
  tone: Tone,
): "celebrate" | "unimpressed" | "wave" {
  if (vs === "first") return "wave";
  if (vs === "beat") return "celebrate";
  // Plenty left in the tank on a set that did not beat the last one.
  const coasting = rir !== null && rir >= 3;
  if (vs === "missed") return tone === "encouraging" ? "wave" : "unimpressed";
  // matched
  if (coasting) return tone === "encouraging" ? "wave" : "unimpressed";
  return tone === "hype" ? "unimpressed" : "wave";
}

/** The shape of one activity: how long it runs and where it goes. */
export const NEAR = 8;
export const FAR = 92;
/** Past this many, there is no room to run and it becomes a boxing gym. */
export const CROWD = 8;

/**
 * `fromX` is where he already is.
 *
 * Leaving it out was why he teleported: every activity started at the middle
 * of the stage, so finishing a lap at the far end and starting a set put him
 * back in the centre between one frame and the next.
 */
export function activityState(activity: Activity, roll: number, fromX = 50): CompanionState {
  const r = Math.max(0, Math.min(0.999, roll));
  const base = { activity, x: fromX, toX: fromX, facing: 1 as 1 | -1, pattern: "squat" as PatternKey };
  // He works the ends of the room: a set happens where he has walked to, and
  // walking takes him to whichever end he is not at.
  const otherEnd = fromX > 50 ? NEAR : FAR;
  switch (activity) {
    case "walk":
      return { ...base, duration: 4 + r * 3, toX: otherEnd };
    case "laps":
      // Track and field: end to end and back, several times.
      return { ...base, duration: 7 + r * 5, toX: FAR };
    case "sleep":
      // Long, because waking up every four seconds is not sleeping. He stays
      // where he dropped.
      return { ...base, duration: 20 + r * 20 };
    case "set":
      return { ...base, duration: 6 + r * 4, pattern: MOVES[Math.floor(r * MOVES.length)] };
    case "spar":
      // On the spot, because the floor is full.
      return { ...base, duration: 4 + r * 4, pattern: "punch" };
    case "wave":
      return { ...base, duration: 2.5 };
    case "celebrate":
      return { ...base, duration: 3.5 };
    case "unimpressed":
      return { ...base, duration: 3.5 };
    case "think":
      return { ...base, duration: 3 };
    default:
      return { ...base, duration: 3 + r * 3 };
  }
}

/* ------------------------------------------------------------- poses --- */

/**
 * A body with both arms and both legs.
 *
 * The exercise thumbnails draw one of each, which is right for a diagram —
 * you are looking at a shape, not a person. A figure that *walks* with one
 * leg reads as a hop, and one arm reads as an injury, so the companion has
 * his own richer skeleton and the movement patterns are mirrored into it.
 */
export type Pose = {
  head: [number, number];
  shoulder: [number, number];
  hip: [number, number];
  armL: { elbow: [number, number]; hand: [number, number] };
  armR: { elbow: [number, number]; hand: [number, number] };
  legL: { knee: [number, number]; foot: [number, number] };
  legR: { knee: [number, number]; foot: [number, number] };
};

const STAND: Joints = {
  head: [50, 15], shoulder: [50, 28], elbow: [50, 42], hand: [50, 55],
  hip: [50, 55], knee: [50, 75], foot: [50, 94],
};

const at = (p: [number, number], dx: number, dy: number): [number, number] => [p[0] + dx, p[1] + dy];

/** Sine between -1 and 1 for a phase in 0–1. */
const swing = (phase: number, cycles = 1) => Math.sin(phase * cycles * Math.PI * 2);

/**
 * A stride.
 *
 * Legs a half-cycle apart, arms a half-cycle behind the leg on their own
 * side, a bob at twice the leg rate — one dip per footfall — and a forward
 * lean that grows with speed. That combination is what stops it reading as a
 * loop: nothing in it repeats at the same rate as anything else.
 *
 * `intensity` scales the whole thing, so the same function walks and runs.
 */
export function stridePose(phase: number, intensity = 1): Pose {
  const cycles = 1;
  const s = swing(phase, cycles);
  const opposite = swing(phase + 0.5, cycles);
  const reach = 9 * intensity;
  const armReach = 7 * intensity;
  const bob = Math.abs(swing(phase, cycles * 2)) * 1.6 * intensity;
  const lean = 2.5 * intensity;
  const knee = (sw: number) => 75 - Math.max(0, sw) * 4 * intensity;

  return {
    head: at(STAND.head, lean, -bob),
    shoulder: at(STAND.shoulder, lean * 0.6, -bob),
    hip: at(STAND.hip, 0, -bob),
    // The right arm swings with the *left* leg. Get this backwards and the
    // whole thing reads as a wind-up toy, which is the difference between a
    // figure that is walking and one that is being moved.
    armL: {
      elbow: [50 + s * armReach * 0.5, 41 - bob],
      hand: [50 + s * armReach, 53 - bob - Math.abs(s) * 2],
    },
    armR: {
      elbow: [50 + opposite * armReach * 0.5, 41 - bob],
      hand: [50 + opposite * armReach, 53 - bob - Math.abs(opposite) * 2],
    },
    legL: {
      knee: [50 + opposite * reach * 0.55, knee(opposite) - bob],
      foot: [50 + opposite * reach, 94 - Math.max(0, opposite) * 7 * intensity],
    },
    legR: {
      knee: [50 + s * reach * 0.55, knee(s) - bob],
      foot: [50 + s * reach, 94 - Math.max(0, s) * 7 * intensity],
    },
  };
}

/** Standing, breathing, weight shifting slowly from one foot to the other. */
export function idlePose(phase: number): Pose {
  const b = swing(phase, 1) * 0.7;
  const sway = swing(phase, 0.5) * 1.2;
  return {
    head: at(STAND.head, sway * 0.6, -b),
    shoulder: at(STAND.shoulder, sway * 0.4, -b * 0.8),
    hip: at(STAND.hip, sway * 0.2, 0),
    armL: { elbow: [46 + sway * 0.3, 42], hand: [45 + sway * 0.5, 55 - b * 0.4] },
    armR: { elbow: [54 + sway * 0.3, 42], hand: [55 + sway * 0.5, 55 + b * 0.4] },
    legL: { knee: [47, 75], foot: [46, 94] },
    legR: { knee: [53, 75], foot: [54, 94] },
  };
}

/**
 * Out cold on the floor, breathing.
 *
 * Lying down rather than standing still with his eyes shut: a figure that is
 * merely motionless reads as broken, and the whole point of him is that a
 * still companion should look like a resting one. The chest rises and falls
 * on the same slow swing everything else here uses, and the arm under his
 * head is what makes it a nap instead of a collapse.
 */
export function sleepPose(phase: number): Pose {
  // The floor is y = 94, where his feet stand. Lying on it puts everything
  // within a few units of that.
  const breath = swing(phase, 1) * 1.1;
  return {
    head: [30, 86 - breath * 0.4],
    shoulder: [42, 88 - breath],
    hip: [58, 90],
    // One arm folded under the head, the other draped over him.
    armL: { elbow: [36, 82 - breath], hand: [30, 79 - breath] },
    armR: { elbow: [46, 94], hand: [40, 93] },
    // Knees drawn up, the way anybody actually sleeps.
    legL: { knee: [70, 86], foot: [64, 94] },
    legR: { knee: [72, 90], foot: [66, 94] },
  };
}

/** One arm up, waving from the elbow; the other stays down. */
export function wavePose(phase: number): Pose {
  const w = swing(phase, 3);
  const base = idlePose(phase * 0.3);
  return {
    ...base,
    armR: { elbow: [58, 30], hand: [63 + w * 7, 17 + Math.abs(w) * 2] },
  };
}

/** Hand to the chin, weight on one leg, a slow nod. */
export function thinkPose(phase: number): Pose {
  const n = swing(phase, 0.75);
  const base = idlePose(phase * 0.4);
  return {
    ...base,
    head: at(STAND.head, n * 1.5, 0),
    armR: { elbow: [58, 44], hand: [53, 22] },
    legL: { knee: [46, 75], foot: [44, 94] },
    legR: { knee: [53, 75], foot: [55, 94] },
  };
}

/** Both arms up, jumping — two fists at the top of a set she just beat. */
export function celebratePose(phase: number): Pose {
  const hop = Math.max(0, swing(phase, 3));
  const lift = hop * 9;
  const spread = 3 + hop * 3;
  return {
    head: at(STAND.head, 0, -lift),
    shoulder: at(STAND.shoulder, 0, -lift),
    hip: at(STAND.hip, 0, -lift),
    armL: { elbow: [43 - spread * 0.4, 22 - lift], hand: [38 - spread, 8 - lift] },
    armR: { elbow: [57 + spread * 0.4, 22 - lift], hand: [62 + spread, 8 - lift] },
    legL: { knee: [46, 74 - lift + hop * 3], foot: [44, 94 - lift * 1.5] },
    legR: { knee: [54, 74 - lift + hop * 3], foot: [56, 94 - lift * 1.5] },
  };
}

/**
 * Hands on hips, a slow head shake. Read at a glance as "that was not it" —
 * the arms are the tell, because a stick figure has no face to pull.
 */
export function unimpressedPose(phase: number): Pose {
  const shake = swing(phase, 2) * 3;
  return {
    head: at(STAND.head, shake, 1),
    shoulder: STAND.shoulder,
    hip: STAND.hip,
    armL: { elbow: [40, 40], hand: [46, 54] },
    armR: { elbow: [60, 40], hand: [54, 54] },
    legL: { knee: [45, 75], foot: [43, 94] },
    legR: { knee: [55, 75], foot: [57, 94] },
  };
}

/**
 * One rep of a movement, mirrored into two limbs.
 *
 * The library's patterns carry one arm and one leg. Both sides doing the same
 * thing is right for a squat and near enough for everything else at this
 * size, with a small offset so the far limbs read as behind rather than
 * welded on.
 */
export function setPose(pattern: PatternKey, phase: number): Pose {
  const p = PATTERNS[pattern] ?? PATTERNS.squat;
  // A triangle wave, not a sine: a rep has a bottom and a top, and easing
  // through both makes it float.
  const t = 1 - Math.abs(((phase * 4) % 2) - 1);
  const ease = t * t * (3 - 2 * t);
  const j = lerpJoints(p.start, p.end, ease);
  return {
    head: j.head,
    shoulder: j.shoulder,
    hip: j.hip,
    armL: { elbow: at(j.elbow, -3, 0), hand: at(j.hand, -4, 0) },
    armR: { elbow: at(j.elbow, 3, 0), hand: at(j.hand, 4, 0) },
    legL: { knee: at(j.knee, -3, 0), foot: at(j.foot, -4, 0) },
    legR: { knee: at(j.knee, 3, 0), foot: at(j.foot, 4, 0) },
  };
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
  if (activity !== "walk" && activity !== "laps") {
    return { x, facing: state.facing };
  }

  if (activity === "walk") {
    const t = Math.max(0, Math.min(1, elapsed / duration));
    return { x: x + (toX - x) * t, facing: toX >= x ? 1 : -1 };
  }

  // Laps: he runs to the far end, then ping-pongs between the two.
  //
  // The run-up is the whole point of this branch. It used to return NEAR at
  // elapsed 0 whatever `x` was, so finishing a set at the far end and
  // starting a lap made him vanish from there and reappear at the other end
  // of the strip mid-stride — the skip that made him look broken. He now sets
  // off from wherever he is, at lap pace, and only starts ping-ponging once
  // he has arrived.
  const LAP_S = 4;
  const speed = (FAR - NEAR) / LAP_S;
  // Toward whichever end he is not at, so the run-up is a run rather than a
  // step.
  const first = x <= 50 ? FAR : NEAR;
  const runUp = Math.abs(first - x) / speed;

  if (elapsed < runUp) {
    const t = elapsed / runUp;
    return { x: x + (first - x) * t, facing: first >= x ? 1 : -1 };
  }

  const other = first === FAR ? NEAR : FAR;
  const cycle = ((elapsed - runUp) % (LAP_S * 2)) / LAP_S;
  const out = cycle <= 1;
  const [from, to] = out ? [first, other] : [other, first];
  const t = out ? cycle : cycle - 1;
  return { x: from + (to - from) * t, facing: to >= from ? 1 : -1 };
}

/**
 * How fast the pose cycles, per activity.
 *
 * Everything ran on one two-second loop before, which is precisely what made
 * it read as a loop: a stride, a wave and a rep are not the same tempo, and
 * running is not the same tempo as walking.
 */
export function phaseFor(activity: Activity, elapsed: number): number {
  const perSecond =
    // Slow enough to read as breathing rather than as twitching.
    activity === "sleep" ? 0.12
      : activity === "laps" ? 1.6
        : activity === "walk" ? 0.85
        : activity === "spar" ? 0.9
        : activity === "set" ? 0.45
          : activity === "celebrate" ? 1.1
            : activity === "wave" ? 0.9
              : activity === "unimpressed" ? 0.5
                : 0.28;
  return (elapsed * perSecond) % 1;
}
