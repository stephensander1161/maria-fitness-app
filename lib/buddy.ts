/**
 * The little figure at the bottom of every screen, and what he knows.
 *
 * He started as a chat bubble, became a stick man, and briefly became a crowd
 * of them with buttons to add and remove. This is the version that earns its
 * place: one of him, and everything about him is read off her own data. He is
 * a status line that happens to have legs.
 *
 * The rule that shapes the whole file: **he never says anything the data does
 * not support.** A day with nothing logged is not a day she ate no protein,
 * and a new account with no sessions is not someone who has stopped training.
 * Both of those are `unknown`, and unknown gets a different line — or no line
 * at all — rather than a number treated as zero. Summing nulls as zeros here
 * would have him nagging someone about a failure they did not have, in a
 * speech bubble, every time they open the app.
 */

import type { GoalDirection } from "@/lib/nutrition";

export type Tone = "encouraging" | "plain" | "hype";

export type BuddyState = {
  /** Sessions with work in them over the last fortnight. */
  sessions14: number;
  /** Sessions her plan called for over the same fortnight. */
  planned14: number;
  /** Days since the last session. Null when she has never trained. */
  daysSinceSession: number | null;
  trainedToday: boolean;
  /** Grams of protein counted today. Null when nothing is logged at all. */
  proteinG: number | null;
  proteinTargetG: number | null;
  /** False when some of today's entries carried no figure — so it is a floor. */
  proteinComplete: boolean;
  /** How many things she has logged today, of any kind. */
  entriesToday: number;
  weighedToday: boolean;
  /** Her local hour, 0–23. Some lines only make sense late in the day. */
  hour: number;
  direction: GoalDirection;
  tone: Tone;
};

/* ── How big he is ────────────────────────────────────────────────────── */

export type Condition = "unknown" | "light" | "steady" | "strong";

/** The smallest and largest he is ever drawn, as a multiple of his own size. */
export const MIN_SCALE = 0.82;
export const MAX_SCALE = 1.18;

/**
 * His size, from what she has actually trained over the last fortnight.
 *
 * A fortnight rather than a week: one missed week is a holiday, a busy
 * stretch, a cold. Shrinking him the moment she takes seven days off would
 * make him a scold, and this app's rule about a bad week is that it is not a
 * character flaw.
 *
 * **Nobody starts small.** With no plan to measure against, or no history at
 * all, he is his ordinary size and the condition is `unknown` — an empty
 * database is not evidence of anything, and greeting a new account with a
 * shrivelled mascot is the app telling someone they have failed at something
 * they have not started.
 */
export function condition(s: Pick<BuddyState, "sessions14" | "planned14">):
  { condition: Condition; scale: number } {
  if (s.planned14 <= 0) return { condition: "unknown", scale: 1 };
  const ratio = s.sessions14 / s.planned14;
  if (s.sessions14 === 0) return { condition: "light", scale: MIN_SCALE };
  if (ratio < 0.5) return { condition: "light", scale: 0.9 };
  if (ratio < 0.9) return { condition: "steady", scale: 1 };
  return { condition: "strong", scale: MAX_SCALE };
}

/* ── How full he is ───────────────────────────────────────────────────── */

/**
 * Today's protein as a fraction of target, or null when it cannot be said.
 *
 * Null in two different ways, and both matter. Nothing logged is not zero
 * protein — she has eaten, she has not written it down. And a target nobody
 * has set is not a target of zero.
 */
export function fullness(s: Pick<BuddyState, "proteinG" | "proteinTargetG" | "entriesToday">): number | null {
  if (s.entriesToday === 0) return null;
  // `!Number.isFinite` rather than `=== null`, and that is not belt-and-
  // braces: an absent database column arrives as `undefined`, which is not
  // `null`, so the null check passed it through and the division produced
  // NaN — a "protein bar" of NaN% width and a figure that had no idea. Every
  // shape of missing is missing.
  if (!Number.isFinite(s.proteinG)) return null;
  if (!Number.isFinite(s.proteinTargetG) || (s.proteinTargetG ?? 0) <= 0) return null;
  return Math.max(0, Math.min(1, s.proteinG! / s.proteinTargetG!));
}

/* ── What he says ─────────────────────────────────────────────────────── */

export type Bark = {
  /** What he says. One short line — it is a speech bubble, not a paragraph. */
  text: string;
  /** Why he is saying it, so the UI can colour it and a test can name it. */
  kind: "protein" | "training" | "weigh-in" | "praise" | "idle";
};

/** After this, a day with nothing logged is worth mentioning. */
export const LATE_HOUR = 14;
/** Past this many days without a session, he notices. */
export const STALE_DAYS = 4;

const say = (tone: Tone, lines: Record<Tone, string>) => lines[tone];

/**
 * One line, chosen by what is true — never at random.
 *
 * Ordered, and the first thing that applies wins, so the same day always
 * produces the same line and the most useful thing is the thing he says. A
 * shuffle would make him decoration; this makes him worth reading.
 *
 * A voice changes how it is said and never what is true — the rule the coach's
 * three tones follow, and for the same reason. The blunt one is short, not
 * cruel: "no excuses" is not in here and must not be.
 */
export function bark(s: BuddyState): Bark {
  const full = fullness(s);
  const shortOnProtein = full !== null && full < 0.7;

  // 1. Protein, when it is genuinely short and there is still a day to fix it
  //    in. Only ever from counted entries — a floor, never a verdict.
  if (shortOnProtein && s.proteinTargetG !== null && s.proteinG !== null) {
    const left = Math.round(s.proteinTargetG - s.proteinG);
    return {
      kind: "protein",
      text: say(s.tone, {
        encouraging: `${left}g of protein to go — you've got this.`,
        plain: `${left}g of protein left today.`,
        hype: `${left}g of protein left. Feed me.`,
      }),
    };
  }

  // 2. Nothing written down at all, once the day is well under way.
  if (s.entriesToday === 0 && s.hour >= LATE_HOUR) {
    return {
      kind: "protein",
      text: say(s.tone, {
        encouraging: "Nothing in the food log yet — even a rough note helps.",
        plain: "Nothing logged today.",
        hype: "Log something. I'm starving down here.",
      }),
    };
  }

  // 3. A gap in the training. Never on the first day off, and never at all
  //    for someone who has not started — there is no gap to be in.
  if (s.daysSinceSession !== null && s.daysSinceSession >= STALE_DAYS) {
    const d = s.daysSinceSession;
    return {
      kind: "training",
      text: say(s.tone, {
        encouraging: `${d} days since the last session — a short one still counts.`,
        plain: `${d} days since your last session.`,
        hype: `${d} days. Let's go.`,
      }),
    };
  }

  // 4. Trained today. Said plainly and specifically, because the thing this
  //    app exists to get her to do deserves better than a card turning green.
  if (s.trainedToday) {
    return {
      kind: "praise",
      text: say(s.tone, {
        encouraging: "Session's in the book. Nice work.",
        plain: "Trained today.",
        hype: "Session done. Get it.",
      }),
    };
  }

  // 5. The scale, but only as the last useful thing rather than the first.
  if (!s.weighedToday && s.hour >= LATE_HOUR) {
    return {
      kind: "weigh-in",
      text: say(s.tone, {
        encouraging: "No weigh-in today — tomorrow morning, then.",
        plain: "No weigh-in today.",
        hype: "Scale missed you this morning.",
      }),
    };
  }

  // 6. Protein is in. Worth saying: it is the one number that is hard to hit
  //    and easy to not notice hitting.
  if (full !== null && full >= 1) {
    return {
      kind: "praise",
      text: say(s.tone, {
        encouraging: "Protein's in for the day. That's the hard one.",
        plain: "Protein target hit.",
        hype: "Protein: done. Beautiful.",
      }),
    };
  }

  // 7. Nothing to report. He says what he is here for rather than filling the
  //    silence with a fact she did not ask for.
  const goal: Record<GoalDirection, string> = {
    lose: "Steady week.",
    gain: "Eat, lift, repeat.",
    hold: "Holding steady.",
  };
  return {
    kind: "idle",
    text: say(s.tone, {
      encouraging: goal[s.direction],
      plain: goal[s.direction],
      hype: goal[s.direction],
    }),
  };
}
