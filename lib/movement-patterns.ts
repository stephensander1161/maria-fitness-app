/**
 * Wireframe figures for the exercise library.
 *
 * Drawn rather than sourced: no licensing, no hosting, a few hundred bytes, and
 * they inherit the theme. A stick figure can honestly convey a *pattern* — is
 * this a hinge or a squat, am I pushing or pulling — which is exactly the thing
 * a beginner gets wrong. It cannot convey the difference between a goblet squat
 * and a box squat, so it does not pretend to: exercises map onto ~14 patterns.
 *
 * Side view. Coordinates are 0–100 with y increasing downward.
 */

export type Joints = {
  head: [number, number];
  shoulder: [number, number];
  elbow: [number, number];
  hand: [number, number];
  hip: [number, number];
  knee: [number, number];
  foot: [number, number];
};

export type Pattern = {
  /** What the figure is showing, for the caption and for screen readers. */
  label: string;
  start: Joints;
  end: Joints;
};

const STAND: Joints = {
  head: [50, 15], shoulder: [50, 28], elbow: [50, 42], hand: [50, 55],
  hip: [50, 55], knee: [50, 75], foot: [50, 94],
};

export const PATTERNS: Record<string, Pattern> = {
  squat: {
    label: "Sit down between your hips, chest up",
    start: STAND,
    end: {
      head: [46, 26], shoulder: [46, 38], elbow: [48, 50], hand: [52, 56],
      hip: [40, 66], knee: [58, 72], foot: [52, 94],
    },
  },
  hinge: {
    label: "Push the hips back, back flat",
    start: STAND,
    end: {
      head: [30, 34], shoulder: [36, 40], elbow: [40, 54], hand: [42, 68],
      hip: [56, 56], knee: [54, 75], foot: [50, 94],
    },
  },
  lunge: {
    label: "Step out, drop straight down",
    start: STAND,
    end: {
      head: [48, 22], shoulder: [48, 34], elbow: [48, 48], hand: [48, 58],
      hip: [48, 60], knee: [66, 74], foot: [70, 94],
    },
  },
  horizontalPush: {
    label: "Press away from the chest",
    start: {
      head: [50, 15], shoulder: [50, 30], elbow: [38, 38], hand: [40, 50],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
    end: {
      head: [50, 15], shoulder: [50, 30], elbow: [64, 34], hand: [78, 34],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
  },
  verticalPush: {
    label: "Press straight overhead",
    start: {
      head: [50, 18], shoulder: [50, 31], elbow: [38, 30], hand: [40, 18],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
    end: {
      head: [50, 18], shoulder: [50, 31], elbow: [50, 18], hand: [50, 5],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
  },
  horizontalPull: {
    label: "Drive the elbow back to the hip",
    start: {
      head: [36, 30], shoulder: [42, 38], elbow: [46, 52], hand: [48, 66],
      hip: [58, 52], knee: [56, 74], foot: [52, 94],
    },
    end: {
      head: [36, 30], shoulder: [42, 38], elbow: [58, 42], hand: [50, 44],
      hip: [58, 52], knee: [56, 74], foot: [52, 94],
    },
  },
  verticalPull: {
    label: "Pull the elbows down to the ribs",
    start: {
      head: [50, 22], shoulder: [50, 34], elbow: [44, 20], hand: [42, 6],
      hip: [50, 58], knee: [50, 78], foot: [50, 95],
    },
    end: {
      head: [50, 18], shoulder: [50, 32], elbow: [36, 40], hand: [44, 22],
      hip: [50, 58], knee: [50, 78], foot: [50, 95],
    },
  },
  bridge: {
    label: "Drive through the heels, squeeze at the top",
    start: {
      head: [22, 66], shoulder: [32, 68], elbow: [34, 78], hand: [42, 82],
      hip: [56, 76], knee: [70, 62], foot: [80, 84],
    },
    end: {
      head: [22, 66], shoulder: [32, 68], elbow: [34, 78], hand: [42, 82],
      hip: [56, 56], knee: [70, 58], foot: [80, 84],
    },
  },
  plank: {
    label: "One straight line, ribs tucked",
    start: {
      head: [22, 52], shoulder: [34, 56], elbow: [30, 74], hand: [22, 74],
      hip: [58, 64], knee: [72, 70], foot: [86, 76],
    },
    end: {
      head: [22, 54], shoulder: [34, 58], elbow: [30, 76], hand: [22, 76],
      hip: [56, 62], knee: [72, 68], foot: [86, 76],
    },
  },
  carry: {
    label: "Tall and braced, walk it",
    start: {
      head: [46, 15], shoulder: [46, 28], elbow: [46, 42], hand: [46, 56],
      hip: [48, 56], knee: [42, 76], foot: [36, 94],
    },
    end: {
      head: [54, 15], shoulder: [54, 28], elbow: [54, 42], hand: [54, 56],
      hip: [52, 56], knee: [60, 76], foot: [66, 94],
    },
  },
  curl: {
    label: "Elbows pinned, curl up",
    start: STAND,
    end: {
      head: [50, 15], shoulder: [50, 28], elbow: [50, 44], hand: [40, 32],
      hip: [50, 55], knee: [50, 75], foot: [50, 94],
    },
  },
  raise: {
    label: "Lead with the elbows, stop at shoulder height",
    start: STAND,
    end: {
      head: [50, 15], shoulder: [50, 28], elbow: [66, 28], hand: [80, 30],
      hip: [50, 55], knee: [50, 75], foot: [50, 94],
    },
  },
  rotation: {
    label: "Turn through the ribs, not the lower back",
    start: {
      head: [50, 15], shoulder: [50, 30], elbow: [40, 40], hand: [34, 48],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
    end: {
      head: [50, 15], shoulder: [50, 30], elbow: [62, 38], hand: [76, 42],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
  },
  /**
   * Sitting on a bench, leaning back, punching across the body.
   *
   * It used to fall through to the plank, which is a person lying face down —
   * about as wrong as a drawing can be for a movement done sitting up. The
   * angle of the torso is the whole point: the abs hold it there, and that is
   * why this is a core exercise and not an arm one.
   */
  punch: {
    label: "Sit leaning back, turn through the middle and punch across",
    start: {
      head: [26, 40], shoulder: [32, 52], elbow: [38, 60], hand: [32, 64],
      hip: [44, 72], knee: [62, 78], foot: [74, 93],
    },
    end: {
      head: [26, 40], shoulder: [32, 52], elbow: [48, 54], hand: [64, 47],
      hip: [44, 72], knee: [62, 78], foot: [74, 93],
    },
  },
  /** Flat on the floor, folding into a V — both ends lifting at once. */
  vSit: {
    label: "Lift the arms and legs together into a V",
    start: {
      head: [18, 84], shoulder: [28, 88], elbow: [20, 84], hand: [12, 80],
      hip: [52, 92], knee: [70, 92], foot: [88, 92],
    },
    end: {
      head: [24, 52], shoulder: [32, 62], elbow: [38, 58], hand: [50, 54],
      hip: [52, 92], knee: [66, 72], foot: [76, 54],
    },
  },
  cardio: {
    label: "Steady, upright, keep moving",
    start: {
      head: [48, 15], shoulder: [48, 28], elbow: [40, 38], hand: [36, 48],
      hip: [50, 56], knee: [40, 74], foot: [32, 92],
    },
    end: {
      head: [52, 15], shoulder: [52, 28], elbow: [62, 38], hand: [68, 46],
      hip: [50, 56], knee: [62, 74], foot: [70, 92],
    },
  },
  mobility: {
    label: "Move slowly, breathe through it",
    start: {
      head: [30, 46], shoulder: [40, 52], elbow: [34, 66], hand: [28, 76],
      hip: [62, 60], knee: [74, 74], foot: [64, 88],
    },
    end: {
      head: [26, 56], shoulder: [38, 58], elbow: [32, 70], hand: [26, 78],
      hip: [62, 54], knee: [76, 70], foot: [66, 88],
    },
  },
};

export type PatternKey = keyof typeof PATTERNS;

/**
 * Which pattern a movement belongs to, from its name and category.
 *
 * Derived rather than hand-mapped across 125 slugs: a mapping table would rot
 * the moment the library grew, and the keywords below are what the names
 * actually contain. Order matters — the first match wins, so the specific
 * cases sit above the general ones.
 */
const RULES: [RegExp, PatternKey][] = [
  // Before the plank rule, which otherwise catches these through `category`.
  [/punch|jab|boxer/, "punch"],
  [/v-?up|jackknife|sit-?up|toe-touch|pike-crunch/, "vSit"],
  [/plank|hollow|dead-?bug|bird-?dog|superman|ab-wheel|crunch|knee-raise/, "plank"],
  [/pallof|woodchop|rotation|twist|russian/, "rotation"],
  [/carry|suitcase|farmer|rack-walk|weighted-walk/, "carry"],
  [/bridge|thrust|hip-extension|clamshell|donkey/, "bridge"],
  [/lunge|split-squat|step-up|step-down|bulgarian/, "lunge"],
  [/squat|leg-press|wall-sit|leg-extension/, "squat"],
  [/deadlift|rdl|romanian|hinge|good-?morning|swing|pull-through|hamstring-curl|back-extension/, "hinge"],
  [/pulldown|pull-?up|chin-?up|lat-|dead-hang|negative-pull/, "verticalPull"],
  [/row|face-pull|pull-apart|ytw|rear-delt/, "horizontalPull"],
  [/overhead-press|shoulder-press|pike-push|handstand|half-kneeling-press|z-press|arnold/, "verticalPush"],
  [/push-?up|bench|chest-press|floor-press|dip|fly/, "horizontalPush"],
  // Catch-all for any remaining press, after the overhead cases above.
  [/press/, "horizontalPush"],
  [/curl|bicep/, "curl"],
  [/raise|lateral|shrug|pushdown|extension|kickback|calf/, "raise"],
  [/walk|run|jog|bike|row-machine|elliptical|jump|skip|march|stair|shadow|swim|intervals/, "cardio"],
];

export function patternFor(slug: string, category: string): PatternKey {
  for (const [test, key] of RULES) if (test.test(slug)) return key;
  // Category is the fallback, so a movement added later still gets something
  // honest rather than a stick figure doing the wrong thing.
  if (category === "mobility") return "mobility";
  if (category === "cardio") return "cardio";
  if (category === "core") return "plank";
  return "squat";
}
