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
  /**
   * On your back on a bench, pressing up.
   *
   * This used to be drawn as a person standing bolt upright pushing something
   * away from their chest, for every bench and chest press in the library —
   * which is a cable fly at best and nothing at all at worst. The give-away
   * that a figure is wrong is that it does not tell you what to do with your
   * body, and a bench press is almost entirely about what your body is doing.
   */
  benchPress: {
    label: "Flat on the bench, press the weight straight up",
    start: {
      head: [20, 62], shoulder: [34, 68], elbow: [26, 80], hand: [42, 76],
      hip: [62, 70], knee: [78, 74], foot: [90, 92],
    },
    end: {
      head: [20, 62], shoulder: [34, 68], elbow: [36, 58], hand: [38, 45],
      hip: [62, 70], knee: [78, 74], foot: [90, 92],
    },
  },
  /** Face down, one straight line from head to heels, bending at the elbow. */
  pushUp: {
    label: "One straight line from head to heels, chest to the floor",
    start: {
      head: [18, 56], shoulder: [32, 62], elbow: [32, 76], hand: [30, 90],
      hip: [60, 70], knee: [76, 78], foot: [92, 86],
    },
    end: {
      head: [18, 70], shoulder: [32, 76], elbow: [20, 82], hand: [30, 90],
      hip: [60, 80], knee: [76, 84], foot: [92, 88],
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
  /**
   * The arm coming up in *front* of the body — which, drawn side-on, is what
   * this figure has always shown. It was labelled as a lateral raise, and
   * that is the one movement a side view cannot draw: arms going out to the
   * left and right point at the viewer and barely move on screen.
   */
  raise: {
    label: "Lead with the elbows, stop at shoulder height",
    start: STAND,
    end: {
      head: [50, 15], shoulder: [50, 28], elbow: [66, 28], hand: [80, 30],
      hip: [50, 55], knee: [50, 75], foot: [50, 94],
    },
  },
  /**
   * Pressing on an incline: the torso leans back against the bench, the
   * hands drive up and slightly back over the chest. Drawn as a flat press
   * the figure was upright, which is the one thing an incline is not.
   */
  inclinePress: {
    label: "Back on the bench, press up and slightly back",
    start: {
      head: [38, 30], shoulder: [44, 40], elbow: [52, 48], hand: [58, 42],
      hip: [58, 62], knee: [72, 74], foot: [86, 88],
    },
    end: {
      head: [38, 30], shoulder: [44, 40], elbow: [46, 30], hand: [48, 18],
      hip: [58, 62], knee: [72, 74], foot: [86, 88],
    },
  },
  /**
   * Seated, leaning back, turning side to side. Drawn as a standing rotation
   * it was somebody doing a golf swing.
   */
  seatedTwist: {
    label: "Sit back, feet up, turn from the ribs",
    start: {
      head: [40, 34], shoulder: [46, 44], elbow: [56, 50], hand: [64, 52],
      hip: [58, 68], knee: [74, 58], foot: [84, 76],
    },
    end: {
      head: [40, 34], shoulder: [46, 44], elbow: [48, 56], hand: [46, 64],
      hip: [58, 68], knee: [74, 58], foot: [84, 76],
    },
  },
  /** Heels off the floor. Nothing above the knee moves. */
  calfRaise: {
    label: "Up onto the toes, all the way, then all the way down",
    start: {
      head: [50, 15], shoulder: [50, 30], elbow: [50, 44], hand: [50, 58],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
    end: {
      head: [50, 8], shoulder: [50, 23], elbow: [50, 37], hand: [50, 51],
      hip: [50, 49], knee: [50, 69], foot: [50, 90],
    },
  },
  /**
   * The elbow straightening while the upper arm stays put — a pushdown, a
   * kickback, an overhead extension. Drawn as a lateral raise the whole arm
   * swung out from the shoulder, which is the joint that is meant to be
   * still.
   */
  armExtension: {
    label: "Upper arm still, straighten the elbow",
    start: {
      head: [50, 15], shoulder: [50, 30], elbow: [50, 46], hand: [42, 36],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
    end: {
      head: [50, 15], shoulder: [50, 30], elbow: [50, 46], hand: [50, 62],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
  },
  /** Seated, the knee straightening in front. */
  legExtension: {
    label: "Seated, straighten the knee",
    start: {
      head: [40, 24], shoulder: [42, 36], elbow: [46, 48], hand: [50, 56],
      hip: [46, 60], knee: [64, 62], foot: [64, 82],
    },
    end: {
      head: [40, 24], shoulder: [42, 36], elbow: [46, 48], hand: [50, 56],
      hip: [46, 60], knee: [64, 62], foot: [86, 58],
    },
  },
  /**
   * Shoulders straight up towards the ears; the arms hang and go along for
   * the ride. Drawn with the "raise" pose it had the arms coming out to the
   * side, which is a lateral raise and not a shrug at all.
   */
  shrug: {
    label: "Shoulders straight up, arms hanging",
    start: {
      head: [50, 15], shoulder: [50, 30], elbow: [50, 44], hand: [50, 58],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
    end: {
      head: [50, 15], shoulder: [50, 22], elbow: [50, 36], hand: [50, 50],
      hip: [50, 56], knee: [50, 76], foot: [50, 94],
    },
  },
  /**
   * Out to the sides, seen from the front.
   *
   * The only pose in here drawn facing the viewer, because a lateral raise
   * side-on is an arm that does not appear to move. The legs are set apart to
   * say "this one is front-on" before the arms do.
   */
  lateral: {
    label: "Straight out to the sides, to shoulder height",
    start: {
      head: [50, 15], shoulder: [50, 30], elbow: [42, 42], hand: [40, 54],
      hip: [50, 56], knee: [44, 76], foot: [42, 94],
    },
    end: {
      head: [50, 15], shoulder: [50, 30], elbow: [34, 32], hand: [18, 30],
      hip: [50, 56], knee: [44, 76], foot: [42, 94],
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
   * Standing tall, seen from the front, bending straight over to one side.
   *
   * Drawn front-on, not side-on: a side bend seen from the side is a figure
   * that barely appears to move, which is exactly why it read wrong. Here the
   * head and shoulders lean over while the hand slides down the outside of
   * the thigh, and the feet stay planted apart — the lateral flexion is the
   * whole movement and it is unmistakable from the front.
   */
  sideBend: {
    label: "Stand tall, bend straight to one side — not forward",
    start: {
      head: [50, 15], shoulder: [50, 30], elbow: [58, 42], hand: [60, 55],
      hip: [50, 56], knee: [44, 76], foot: [42, 94],
    },
    end: {
      head: [61, 20], shoulder: [59, 34], elbow: [66, 48], hand: [69, 63],
      hip: [50, 56], knee: [44, 76], foot: [42, 94],
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
  /*
   * The specific ones first, and they have to be: every one of these is a
   * word that a later, broader rule also matches — "incline-dumbbell-press"
   * is a press, "russian-twist" is a twist, "tricep-pushdown" is an
   * extension — and the broader rule drew each of them as the wrong
   * movement. Order is the whole mechanism here.
   */
  [/incline.*(press|bench)/, "inclinePress"],
  [/russian-twist|seated.*twist/, "seatedTwist"],
  [/calf-raise|calf-stretch/, "calfRaise"],
  [/pushdown|kickback|tricep.*extension|terminal-knee/, "armExtension"],
  [/leg-extension/, "legExtension"],
  [/muscle-up/, "verticalPull"],
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
  [/push-?up|press-?up/, "pushUp"],
  [/bench|chest-press|floor-press|chest-fly|dumbbell-fly/, "benchPress"],
  [/dip|fly/, "horizontalPush"],
  // Catch-all for any remaining press, after the overhead cases above.
  [/press/, "horizontalPush"],
  [/curl|bicep/, "curl"],
  // Sides before fronts: "palms-up-lateral-raise" must not be caught by the
  // front-raise rule below just because it contains "raise".
  [/shrug/, "shrug"],
  [/side-bend|side.bend/, "sideBend"],
  [/lateral-raise|side-raise|side-lateral/, "lateral"],
  [/raise|shrug|pushdown|extension|kickback|calf/, "raise"],
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
