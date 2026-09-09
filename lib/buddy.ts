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
import type { Mode } from "@/lib/companion";

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
  /** Sets logged today, of anything. What makes the line move as she works. */
  setsToday: number;
  /** A workout is open right now: started today and not finished. */
  sessionOpen: boolean;
  /** Today asks for no training — a rest day, or nothing planned at all. */
  restToday: boolean;
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

/* ── What he is doing ─────────────────────────────────────────────────── */

/** Asleep before this hour and after the evening one. */
export const WAKES_AT = 6;
export const SLEEPS_AT = 22;

/**
 * Training, up and about, or asleep.
 *
 * **A session running beats everything.** Not the hour, not the rest day, not
 * the fact that he was asleep a second ago — if she has started a workout he
 * is doing it with her, because that is the only moment he is company rather
 * than decoration. Training past midnight is the case that makes this a rule
 * rather than a preference: she is in the gym at one in the morning and the
 * mascot is face-down on the floor.
 *
 * Otherwise he sleeps at night, and on a day with no training in it. Awake
 * and pottering is for a day that has something in it — and he does no sets
 * while she is not training, because reps performed at nobody is the
 * difference between a companion and a screensaver.
 */
export function modeFor(s: Pick<BuddyState, "hour" | "sessionOpen" | "restToday">): Mode {
  if (s.sessionOpen) return "training";
  if (!Number.isFinite(s.hour)) return "about";
  if (s.hour < WAKES_AT || s.hour >= SLEEPS_AT) return "asleep";
  if (s.restToday) return "asleep";
  return "about";
}

/* ── What he says ─────────────────────────────────────────────────────── */

export type Bark = {
  /** What he says. One short line — it is a speech bubble, not a paragraph. */
  text: string;
  /** Why he is saying it, so the UI can colour it and a test can name it. */
  kind: "session" | "protein" | "training" | "weigh-in" | "praise" | "idle";
};

/** After this, a day with nothing logged is worth mentioning. */
export const LATE_HOUR = 14;
/** Past this many days without a session, he notices. */
export const STALE_DAYS = 4;

/**
 * What he says, per situation and per voice.
 *
 * Several lines each, because one line per situation is a sign, not a
 * companion: he sat on "Log something. I'm starving down here." all afternoon
 * while she was mid-session logging sets, which is both wrong and the same
 * wrong thing forty times.
 *
 * Chosen, never shuffled. The line moves with the state — a set lands, the
 * number changes, so does the sentence — which means it varies all day
 * without ever being arbitrary. Same state, same words.
 *
 * A voice changes how it is said and never what is true. The blunt one is
 * short, not cruel: "no excuses" is not in here and must not be.
 */
const LINES: Record<Bark["kind"], Record<Tone, string[]>> = {
  session: {
    encouraging: [
      "You're in it. Nice.",
      "That's another one down.",
      "Steady — one set at a time.",
      "Good work. Keep the rest honest.",
      "Still going. That's the whole thing.",
      "Breathe, then the next one.",
    ],
    plain: [
      "Session running.",
      "Set logged.",
      "Next one when you're ready.",
      "Rest, then go again.",
      "Still on the clock.",
      "Keep it moving.",
    ],
    hype: [
      "Let's go. Next set.",
      "That's what I'm talking about.",
      "Rack it. Go again.",
      "More. Right now.",
      "Don't you dare stop there.",
      "Again. I'm watching.",
    ],
  },
  protein: {
    encouraging: [
      "{n}g of protein to go — you've got this.",
      "{n}g left. A yoghurt does most of that.",
      "{n}g short. Plenty of day left.",
      "{n}g of protein still to find.",
      "Sitting {n}g under. Easy fix.",
    ],
    plain: [
      "{n}g of protein left today.",
      "{n}g short of target.",
      "{n}g to go on protein.",
      "Protein: {n}g under.",
      "{n}g remaining.",
    ],
    hype: [
      "{n}g of protein left. Feed me.",
      "{n}g down. Go eat.",
      "{n}g short. Chicken. Now.",
      "Protein's {n}g light.",
      "{n}g. Sort it.",
    ],
  },
  training: {
    encouraging: [
      "{d} days since the last session — a short one still counts.",
      "{d} days off. Twenty minutes would do it.",
      "It's been {d} days. Start small.",
      "{d} days. The next one is the only one that matters.",
    ],
    plain: [
      "{d} days since your last session.",
      "{d} days off.",
      "Last session was {d} days ago.",
      "{d} days without training.",
    ],
    hype: [
      "{d} days. Let's go.",
      "{d} days off. Enough.",
      "{d} days. Pick something up.",
      "{d} days. Today, then.",
    ],
  },
  "weigh-in": {
    encouraging: [
      "No weigh-in today — tomorrow morning, then.",
      "Scale missed you. No harm.",
      "No weigh-in yet. Mornings are best anyway.",
    ],
    plain: ["No weigh-in today.", "Scale not logged.", "No weight logged today."],
    hype: ["Scale missed you this morning.", "No weigh-in. Step on it tomorrow.", "Scale's lonely."],
  },
  praise: {
    encouraging: [
      "Session's in the book. Nice work.",
      "That's today done. Well held.",
      "Protein's in for the day. That's the hard one.",
      "Good day's work.",
      "Everything on the plan, done.",
    ],
    plain: [
      "Trained today.",
      "Session logged.",
      "Protein target hit.",
      "Today's done.",
      "Plan complete.",
    ],
    hype: [
      "Session done. Get it.",
      "That's the work.",
      "Protein: done. Beautiful.",
      "Today belongs to you.",
      "Plan smashed.",
    ],
  },
  idle: {
    encouraging: [
      "Steady week.",
      "Nothing needed right now.",
      "All quiet. Rest counts too.",
      "On track.",
      "Good place to be.",
    ],
    plain: [
      "Nothing outstanding.",
      "All logged.",
      "On track.",
      "Quiet day.",
      "Nothing to report.",
    ],
    hype: [
      "All good. Stay ready.",
      "Nothing owing. Rare.",
      "On track. Keep it there.",
      "Quiet. For now.",
      "Locked in.",
    ],
  },
};

/**
 * Which of the lines, from the state itself.
 *
 * Not a random pick and not a clock: the same situation always produces the
 * same sentence, and it changes when something about the day changes. A set
 * lands, the count moves, so does the line — variety that comes from her
 * doing things rather than from a shuffle.
 */
function pick(lines: string[], seed: number): string {
  const i = Math.abs(Math.trunc(seed)) % lines.length;
  return lines[i];
}

export function bark(s: BuddyState): Bark {
  const full = fullness(s);
  const shortOnProtein = full !== null && full < 0.7;
  const say = (kind: Bark["kind"], seed: number, vars: Record<string, number> = {}): Bark => {
    let text = pick(LINES[kind][s.tone], seed);
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    return { kind, text };
  };

  // 1. She is training *right now*. Nothing else is the point until she stops
  //    — he told her to go and eat something all afternoon while she was
  //    mid-session logging sets, which is both wrong and irritating.
  if (s.sessionOpen) return say("session", s.setsToday);

  // 2. Protein, when it is genuinely short and there is still a day to fix it
  //    in. Only ever from counted entries — a floor, never a verdict.
  if (shortOnProtein && s.proteinTargetG !== null && s.proteinG !== null) {
    const left = Math.round(s.proteinTargetG - s.proteinG);
    return say("protein", left, { n: left });
  }

  // 3. Nothing written down at all, once the day is well under way.
  if (s.entriesToday === 0 && s.hour >= LATE_HOUR) {
    return {
      kind: "protein",
      text: s.tone === "hype" ? "Nothing logged. Go eat."
        : s.tone === "plain" ? "Nothing logged today."
          : "Nothing in the food log yet — even a rough note helps.",
    };
  }

  // 4. A gap in the training. Never on the first day off, and never at all
  //    for someone who has not started — there is no gap to be in.
  if (s.daysSinceSession !== null && s.daysSinceSession >= STALE_DAYS) {
    return say("training", s.daysSinceSession, { d: s.daysSinceSession });
  }

  // 5. Trained today. Said plainly, because the thing this app exists to get
  //    her to do deserves better than a card turning green.
  if (s.trainedToday) return say("praise", s.setsToday);

  // 6. The scale, but only as the last useful thing rather than the first.
  if (!s.weighedToday && s.hour >= LATE_HOUR) return say("weigh-in", s.hour);

  // 7. Protein is in. Worth saying: it is the one number that is hard to hit
  //    and easy to not notice hitting.
  if (full !== null && full >= 1) return say("praise", s.entriesToday + 2);

  // 8. Nothing to report.
  return say("idle", s.entriesToday + s.hour);

}
