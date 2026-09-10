import type { ISODate } from "@/lib/date";

/**
 * Warming up and cooling down, out of the library that already had them.
 *
 * Forty-two mobility movements were seeded long before this feature, with form
 * cues, common mistakes, safety notes and stick-man animations. The postpartum
 * work nearly made the opposite mistake — it added parallel copies under new
 * slugs and `tests/exercises.test.ts` caught the duplicates — so this adds no
 * content and no table at all. It only decides *which* of them to put in front
 * of her, and when.
 *
 * The when is the part that matters:
 *
 * - **Before is movement, after is a hold.** Static stretching immediately
 *   before lifting measurably lowers force output, and the effect is largest
 *   in the exercises she cares most about. So the warm-up list is drills and
 *   swings and the cool-down list is the long holds, and a slug never appears
 *   in both. This is not a stylistic split.
 * - **It follows the session, not the calendar.** A shoulders day gets
 *   thoracic and chest; a squat day gets ankles and hips. Offering the same
 *   six every day is how a warm-up becomes something to scroll past.
 */

/** The areas this app can prepare, derived from what a day actually trains. */
export type Area =
  | "hips" | "ankles" | "hamstrings" | "quads" | "calves"
  | "thoracic" | "shoulders" | "chest" | "lats"
  | "lowerBack" | "neck" | "wrists";

/**
 * Which muscle names in the library map to which area.
 *
 * Keyed off `primaryMuscles`, so a movement added to the library tomorrow is
 * covered without touching this file.
 */
const AREA_OF: Record<string, Area[]> = {
  glutes: ["hips"],
  hips: ["hips"],
  "hip flexors": ["hips"],
  "hip abductors": ["hips"],
  adductors: ["hips"],
  quads: ["quads", "hips"],
  hamstrings: ["hamstrings"],
  calves: ["calves", "ankles"],
  shoulders: ["shoulders", "thoracic"],
  "rear delts": ["shoulders", "thoracic"],
  "rotator cuff": ["shoulders"],
  chest: ["chest", "thoracic"],
  lats: ["lats", "thoracic"],
  "upper back": ["thoracic"],
  back: ["thoracic"],
  "thoracic spine": ["thoracic"],
  "lower back": ["lowerBack"],
  core: ["lowerBack"],
  obliques: ["lowerBack"],
  neck: ["neck"],
  forearms: ["wrists"],
  forearm: ["wrists"],
  wrist: ["wrists"],
  grip: ["wrists"],
};

/** Movement, before. Nothing held long enough to cost her a rep. */
const WARM_UP: Record<Area, string[]> = {
  hips: ["90-90-hip-switch", "worlds-greatest-stretch", "hip-hinge-drill"],
  ankles: ["ankle-mobilization"],
  hamstrings: ["hip-hinge-drill", "downward-dog"],
  quads: ["worlds-greatest-stretch"],
  calves: ["ankle-mobilization"],
  thoracic: ["cat-cow", "thoracic-rotation"],
  shoulders: ["wall-slide", "band-pass-through", "pendulum-swing"],
  chest: ["band-pass-through", "wall-slide"],
  // Not the dead hang: it is a hold, and it is on the cool-down list for
  // exactly that reason. The rule above is not a style preference.
  lats: ["downward-dog", "thoracic-rotation"],
  lowerBack: ["cat-cow", "pelvic-tilt"],
  neck: ["chin-tuck"],
  wrists: ["wrist-flexor-stretch"],
};

/** Holds, after, when there is nothing left to be strong for. */
const COOL_DOWN: Record<Area, string[]> = {
  hips: ["hip-flexor-stretch", "figure-four-stretch", "frog-stretch"],
  ankles: ["soleus-calf-stretch"],
  hamstrings: ["supine-hamstring-stretch"],
  quads: ["couch-stretch", "standing-quad-stretch"],
  calves: ["gastroc-calf-stretch", "soleus-calf-stretch"],
  thoracic: ["thread-the-needle", "childs-pose"],
  shoulders: ["sleeper-stretch", "upper-trap-stretch"],
  chest: ["doorway-chest-stretch"],
  lats: ["childs-pose", "dead-hang"],
  lowerBack: ["double-knee-to-chest", "supine-lumbar-rotation", "childs-pose"],
  neck: ["upper-trap-stretch", "levator-scapulae-stretch"],
  wrists: ["wrist-flexor-stretch", "wrist-extensor-stretch"],
};

/**
 * A day with nothing on it still gets something.
 *
 * The rest-day screen already said "a walk or some mobility work is plenty"
 * and then offered neither, which is the app naming a thing it does not do.
 */
export const REST_DAY_FLOW = [
  "cat-cow",
  "worlds-greatest-stretch",
  "90-90-hip-switch",
  "thread-the-needle",
  "childs-pose",
];

/** How many to show. Past this it stops being a warm-up and becomes a session. */
export const MAX_STRETCHES = 4;

export function areasFor(muscles: readonly string[]): Area[] {
  const seen = new Set<Area>();
  for (const m of muscles) for (const a of AREA_OF[m.toLowerCase()] ?? []) seen.add(a);
  return [...seen];
}

/**
 * Pick for a session, most-trained area first.
 *
 * Ordered by how many of the day's movements touch an area rather than by the
 * order they happen to be listed in: on a day that is four pressing movements
 * and one set of curls, the shoulders come before the wrists.
 */
function pick(muscles: readonly string[], from: Record<Area, string[]>, limit: number): string[] {
  const weight = new Map<Area, number>();
  for (const m of muscles) {
    for (const a of AREA_OF[m.toLowerCase()] ?? []) weight.set(a, (weight.get(a) ?? 0) + 1);
  }
  const order = [...weight.entries()].sort((x, y) => y[1] - x[1]).map(([a]) => a);
  const out: string[] = [];
  // One pass per rank, so every area gets its first choice before any area
  // gets its second — four hip stretches and nothing for the shoulders is not
  // a warm-up for a day that trained both.
  for (let rank = 0; out.length < limit && rank < 3; rank++) {
    for (const area of order) {
      const slug = from[area][rank];
      if (slug && !out.includes(slug)) out.push(slug);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export const warmUpFor = (muscles: readonly string[], limit = MAX_STRETCHES): string[] =>
  pick(muscles, WARM_UP, limit);

export const coolDownFor = (muscles: readonly string[], limit = MAX_STRETCHES): string[] =>
  pick(muscles, COOL_DOWN, limit);

export type StretchPlan = {
  date: ISODate;
  /** Empty when the day has no movements to prepare for — see REST_DAY_FLOW. */
  warmUp: string[];
  coolDown: string[];
};

/** The whole plan for a day, from the muscles its movements train. */
export function stretchPlan(date: ISODate, muscles: readonly string[]): StretchPlan {
  return { date, warmUp: warmUpFor(muscles), coolDown: coolDownFor(muscles) };
}
