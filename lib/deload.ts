/**
 * Noticing when she has stopped progressing, and saying why.
 *
 * The important half is not the detection — it is the sentence that follows
 * it. A beginner in a calorie deficit stalls *because of the deficit*, and an
 * app that shows a flat line without explaining it has told her she stopped
 * trying. That is the week people conclude it is not working and quit.
 *
 * Two independent triggers, deliberately: performance and fatigue. Either can
 * fire without the other, and they want different answers — a stall with fresh
 * legs is a programming problem, a stall with heavy legs is a recovery one.
 */

import { estimate1RM, type Session } from "./progression-math";

export type MovementStatus = {
  slug: string;
  name: string;
  sessions: number;
  /** Sessions since the best estimated 1RM. */
  sessionsSinceBest: number;
  /** Same load, target reps not reached, this many sessions running. */
  repeatedAtLoad: number;
  stalled: boolean;
  /** Reps in reserve rising at the same load — she is working harder for it. */
  rirCreep: boolean;
};

/** One movement's recent history, newest first. */
export function movementStatus(
  slug: string,
  name: string,
  history: Session[],
  targetReps: number,
): MovementStatus {
  const sessions = [...history].sort((a, b) => b.date.localeCompare(a.date));
  if (sessions.length === 0) {
    return { slug, name, sessions: 0, sessionsSinceBest: 0, repeatedAtLoad: 0, stalled: false, rirCreep: false };
  }

  const bests = sessions.map((s) => {
    let best = 0;
    for (const set of s.sets) {
      const e = estimate1RM(set);
      if (e && e.kg > best) best = e.kg;
    }
    return best;
  });
  const peak = Math.max(...bests);
  const sessionsSinceBest = bests.findIndex((b) => b >= peak);

  // Same working load, top of the range never reached.
  const topLoad = (s: Session) => {
    const loads = s.sets.filter((x) => x.weightKg !== null).map((x) => x.weightKg!);
    return loads.length ? Math.max(...loads) : null;
  };
  const current = topLoad(sessions[0]);
  let repeatedAtLoad = 0;
  for (const s of sessions) {
    if (topLoad(s) !== current) break;
    const reachedTarget = s.sets.some((x) => x.reps >= targetReps);
    if (reachedTarget) break;
    repeatedAtLoad++;
  }

  // Working harder for the same weight: the reps she had left going down
  // session on session at an unchanged load.
  const rirAt = sessions
    .filter((s) => topLoad(s) === current)
    .map((s) => {
      const known = s.sets.map((x) => x.rir).filter((r): r is number => r !== null);
      return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    })
    .filter((r): r is number => r !== null);
  const rirCreep = rirAt.length >= 2 && rirAt[0] < rirAt[rirAt.length - 1] - 0.5;

  return {
    slug, name,
    sessions: sessions.length,
    sessionsSinceBest,
    repeatedAtLoad,
    // Three sessions at the same weight without reaching the target, or four
    // sessions without a new best. One bad day is not a stall.
    stalled: repeatedAtLoad >= 3 || (sessions.length >= 4 && sessionsSinceBest >= 3),
    rirCreep,
  };
}

export type DeloadVerdict = {
  /** Movements that have stopped moving. */
  stalled: MovementStatus[];
  /** Movements where the same weight is costing more. */
  harder: MovementStatus[];
  /** Whether a lighter week is worth proposing. */
  suggestDeload: boolean;
  /**
   * Why, in the app's own voice. Never "you have stalled" — the cause is
   * usually the deficit, which is the plan working, and saying so is the
   * whole point of noticing.
   */
  explanation: string;
};

export function readProgress(
  statuses: MovementStatus[],
  context: { inDeficit: boolean; weeksTraining: number | null },
): DeloadVerdict {
  const stalled = statuses.filter((s) => s.stalled);
  const harder = statuses.filter((s) => s.rirCreep && !s.stalled);

  // A lighter week is worth it when it is not one lift having a bad fortnight.
  const suggestDeload = stalled.length >= 2 || (stalled.length >= 1 && harder.length >= 2);

  if (stalled.length === 0 && harder.length === 0) {
    return {
      stalled, harder, suggestDeload: false,
      explanation: "Everything is still moving. Nothing to change.",
    };
  }

  const names = [...stalled, ...harder].map((s) => s.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

  if (context.inDeficit) {
    return {
      stalled, harder, suggestDeload,
      explanation:
        `${list} ${names.length === 1 ? "has" : "have"} stopped moving. That is what a calorie deficit does — ` +
        `she is asking her body to get stronger on less food, and holding the weight while losing fat is a ` +
        `win, not a plateau. ${suggestDeload
          ? "A lighter week — same movements, half the sets — usually starts it moving again."
          : "Keep the weight where it is and stay with it."}`,
    };
  }

  return {
    stalled, harder, suggestDeload,
    explanation:
      `${list} ${names.length === 1 ? "has" : "have"} stopped moving for a few sessions. ` +
      `${suggestDeload
        ? "A lighter week — same movements, half the sets, weight unchanged — is the usual fix."
        : "One more session at the same weight before changing anything."}`,
  };
}
