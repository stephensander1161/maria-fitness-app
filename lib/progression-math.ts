/**
 * What to lift next, worked out rather than guessed.
 *
 * The coach used to prescribe next week's load itself: unit-aware arithmetic
 * against a history it could only partly see, done fresh every time. It came
 * out inconsistent week to week — and inconsistency in load prescription reads
 * to a beginner as *her* being inconsistent, which is the one thing this app
 * must never imply. So the numbers are a pure function, tested, and the model's
 * job is to explain them.
 *
 * Everything here is metric, because storage is metric. Display conversion
 * happens at the boundary like everything else.
 */

const KG_PER_LB = 0.45359237;

/**
 * The smallest jump the kit can actually make, in kg.
 *
 * Chosen in *her* units and converted, because a rack is stocked in one or the
 * other: a gym in pounds has 5lb dumbbell jumps and 2.5lb plates, and adding a
 * tidy 2kg to it produced "44.1lb" — a weight that exists nowhere. The result
 * is kg because storage is kg; the choice is hers because the iron is.
 */
export function loadStepKg(equipment: string[], units: "metric" | "imperial" = "metric"): number {
  const kit = equipment.map((e) => e.toLowerCase()).join(" ");
  const lb = (n: number) => Math.round(n * KG_PER_LB * 1e6) / 1e6;

  // A dumbbell pair goes up in whole dumbbells — there is no 1kg dumbbell in
  // most gyms, and no 2.5lb one either.
  if (/dumbbell/.test(kit)) return units === "imperial" ? lb(5) : 2;
  if (/kettlebell/.test(kit)) return units === "imperial" ? lb(8) : 4;
  // Machines are pinned, and the pin is usually 5kg or 10lb.
  if (/machine|cable|full gym/.test(kit)) return units === "imperial" ? lb(10) : 5;
  // A barbell takes the smallest pair of plates: 1.25kg or 2.5lb a side.
  if (/barbell|bench|rack/.test(kit)) return units === "imperial" ? lb(5) : 2.5;
  if (/band/.test(kit)) return 0;
  return units === "imperial" ? lb(5) : 2.5;
}

/** Round to something she can actually load on the bar. */
export const toStep = (kg: number, step: number): number =>
  step <= 0 ? Math.round(kg * 10) / 10 : Math.round(kg / step) * step;

export type LoggedSet = { reps: number; weightKg: number | null; rir: number | null };
export type Session = { date: string; sets: LoggedSet[] };

/**
 * Epley, with reps in reserve folded in.
 *
 * `reps + rir` is what she could have done, which is the number the formula is
 * actually about. Accurate to a few percent for 2-10 hard reps and useless
 * above that, so it says when it is useless rather than returning a number
 * that looks the same as a good one.
 */
export function estimate1RM(set: LoggedSet): { kg: number; reliable: boolean; why?: string } | null {
  if (set.weightKg === null || set.weightKg <= 0) return null;
  const effective = set.reps + (set.rir ?? 0);
  const kg = Math.round(set.weightKg * (1 + effective / 30) * 10) / 10;

  if (effective > 12) {
    return { kg, reliable: false, why: "over about 12 effective reps the formula drifts badly" };
  }
  if (set.rir === null) {
    return { kg, reliable: false, why: "how many she had left is unknown, so this assumes she stopped at failure" };
  }
  return { kg, reliable: true };
}

/** The best estimate across a session, and the set it came from. */
export function sessionBest(session: Session): { kg: number; reliable: boolean; set: LoggedSet } | null {
  let best: { kg: number; reliable: boolean; set: LoggedSet } | null = null;
  for (const set of session.sets) {
    const e = estimate1RM(set);
    if (!e) continue;
    if (!best || e.kg > best.kg) best = { kg: e.kg, reliable: e.reliable, set };
  }
  return best;
}

export type Prescription = {
  sets: number;
  reps: number;
  weightKg: number | null;
  /**
   * Why, as a clause with no weights in it.
   *
   * Deliberately unit-free: this module is metric because storage is metric,
   * and a sentence built here reached an imperial user reading "up 2kg" about
   * a set she logged in pounds. The caller composes the full line, converting
   * at the boundary like everything else.
   */
  reason: string;
  change: "up" | "reps" | "hold" | "down" | "first-time";
  /** What she worked at last time, for the caller's sentence. */
  fromWeightKg: number | null;
  stepKg: number;
};

/**
 * Double progression, with the 2-for-2 rule on top.
 *
 * Work in a rep range. Hit the top of the range on every prescribed set and
 * the load goes up by the smallest jump the kit allows, back to the bottom of
 * the range. Beat the target by two or more reps on the last set in two
 * consecutive sessions and it goes up regardless — that is the 2-for-2 rule,
 * and it is what stops someone strong sitting at the same weight for a month.
 *
 * Falling short two sessions running holds the load rather than dropping it:
 * a beginner in a calorie deficit has bad weeks, and cutting the weight is the
 * app telling her she has gone backwards when she has not.
 */
export function nextPrescription(
  target: { sets: number; reps: number; weightKg: number | null },
  history: Session[],
  opts: { stepKg: number; repRange?: number; bodyweight?: boolean },
): Prescription {
  const range = opts.repRange ?? 4;
  const top = target.reps;
  const bottom = Math.max(1, top - range);
  const recent = [...history].sort((a, b) => b.date.localeCompare(a.date));

  if (recent.length === 0 || recent[0].sets.length === 0) {
    return {
      sets: target.sets, reps: target.reps, weightKg: target.weightKg,
      reason: "first time on this one — find a weight you could stop two reps short of",
      change: "first-time",
      fromWeightKg: null, stepKg: opts.stepKg,
    };
  }

  const last = recent[0];
  const working = last.sets.filter((s) => s.weightKg !== null).map((s) => s.weightKg!);
  const lastLoad = working.length ? Math.max(...working) : target.weightKg;
  const atLoad = last.sets.filter((s) => s.weightKg === lastLoad || (lastLoad === null && s.weightKg === null));

  const hitTop = atLoad.length >= target.sets && atLoad.every((s) => s.reps >= top);
  const beatBy2 = atLoad.length > 0 && atLoad[atLoad.length - 1].reps >= top + 2;

  // Two sessions running, so one good day does not move the weight.
  const previous = recent[1];
  const previousBeatBy2 = previous
    ? (() => {
        const prevWorking = previous.sets.filter((s) => s.weightKg !== null).map((s) => s.weightKg!);
        const prevLoad = prevWorking.length ? Math.max(...prevWorking) : null;
        const atPrev = previous.sets.filter((s) => s.weightKg === prevLoad);
        return atPrev.length > 0 && atPrev[atPrev.length - 1].reps >= top + 2;
      })()
    : false;

  if (opts.bodyweight || lastLoad === null || opts.stepKg === 0) {
    // Nothing to add: progress is reps, then a harder variation, which is the
    // coach's call rather than arithmetic.
    const best = Math.max(...last.sets.map((s) => s.reps));
    return {
      sets: target.sets,
      reps: hitTop ? top + 2 : Math.max(target.reps, best),
      weightKg: null,
      reason: hitTop
        ? `${top} on every set last time — add reps, and ask about a harder variation`
        : `keep building reps toward ${top} on all ${target.sets}`,
      change: hitTop ? "reps" : "hold",
      fromWeightKg: null, stepKg: 0,
    };
  }

  if (hitTop || (beatBy2 && previousBeatBy2)) {
    const next = toStep(lastLoad + opts.stepKg, opts.stepKg);
    const reached = Math.min(...atLoad.map((s) => s.reps));
    return {
      sets: target.sets, reps: bottom, weightKg: next,
      reason: hitTop
        ? `${reached} on all ${target.sets} sets last time, so the weight goes up and the reps come back to ${bottom}`
        : `beat the target by two, twice running`,
      change: "up",
      fromWeightKg: lastLoad, stepKg: opts.stepKg,
    };
  }

  const bestReps = Math.max(...atLoad.map((s) => s.reps), 0);
  return {
    sets: target.sets,
    reps: Math.min(top, Math.max(bottom, bestReps + 1)),
    weightKg: lastLoad,
    reason: `same weight, one more rep than last time — working up to ${top} on all ${target.sets}`,
    change: "hold",
    fromWeightKg: lastLoad, stepKg: opts.stepKg,
  };
}

/**
 * Warm-up rungs for a working weight.
 *
 * 40/60/80% rounded to what she can load, duplicates dropped, and nothing at
 * all for a light working set — three warm-ups for a 20kg goblet squat is
 * padding, and padding is what makes people skip warm-ups entirely.
 */
export function warmupRamp(
  workingKg: number,
  stepKg: number,
): { weightKg: number; reps: number }[] {
  if (workingKg <= 0 || stepKg <= 0) return [];
  // Below about 30kg the bar or the lightest pair is warm-up enough.
  if (workingKg < 30) return [{ weightKg: toStep(workingKg * 0.5, stepKg), reps: 8 }]
    .filter((r) => r.weightKg > 0 && r.weightKg < workingKg);

  const rungs = [
    { pct: 0.4, reps: 8 },
    { pct: 0.6, reps: 5 },
    { pct: 0.8, reps: 3 },
  ];
  const out: { weightKg: number; reps: number }[] = [];
  for (const r of rungs) {
    const kg = toStep(workingKg * r.pct, stepKg);
    if (kg <= 0 || kg >= workingKg) continue;
    if (out.some((o) => o.weightKg === kg)) continue;
    out.push({ weightKg: kg, reps: r.reps });
  }
  return out;
}
