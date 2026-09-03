import type { ISODate } from "@/lib/date";

/**
 * A rank that goes up as she keeps showing up.
 *
 * The sidebar used to say "Coach" above her name, which is the app's name and
 * tells her nothing. This says something about her instead, and it changes —
 * a small reason to look at it.
 *
 * Two rules, and they are the whole design:
 *
 * 1. **It only ever goes up.** Every input is a lifetime total, so a bad
 *    fortnight can never demote her. An app that takes a title away for
 *    missing sessions is an app that punishes the exact moment she most needs
 *    a reason to come back.
 * 2. **It is never the joke.** These are meant to be funny about the *doing* —
 *    a bar that keeps getting heavier, a routine that has become a habit —
 *    and never about her body, her weight, her speed, or how far along she is.
 *    Nothing here reads as sarcastic if you are struggling.
 */
export type Rank = {
  /** Points needed. */
  at: number;
  name: string;
  /** One line, shown on hover and to a screen reader. */
  blurb: string;
};

/**
 * Thirty of them, from the first session to a couple of years of turning up.
 *
 * The curve is deliberately front-loaded: the first six come quickly, because
 * the point of failure for a new habit is week two and nothing about week two
 * should feel like standing still. After that it stretches out, so the later
 * ones are worth something.
 */
export const RANKS: Rank[] = [
  { at: 0, name: "Just Started", blurb: "The hardest one is the first one." },
  { at: 12, name: "Showed Up Twice", blurb: "Twice is a pattern. Sort of." },
  { at: 30, name: "Suspiciously Consistent", blurb: "Three sessions in. Something is happening." },
  { at: 55, name: "Owns Gym Shoes", blurb: "They live by the door now." },
  { at: 90, name: "Knows Where The Dumbbells Are", blurb: "No more wandering about looking busy." },
  { at: 135, name: "Rep Counter", blurb: "You've stopped losing count halfway." },
  { at: 190, name: "Two-Week Wonder", blurb: "Past the point most people quietly stop." },
  { at: 260, name: "Habit In Progress", blurb: "It is starting to feel odd to skip." },
  { at: 340, name: "Load Bearing", blurb: "The weights have gone up and stayed up." },
  { at: 440, name: "Warm-Up Enjoyer", blurb: "You do them now. Genuinely impressive." },
  { at: 560, name: "Sets Person", blurb: "Not a sets-ish person. A sets person." },
  { at: 700, name: "Progressive Overloader", blurb: "Adding a little, on purpose, again and again." },
  { at: 870, name: "Rest Timer Respecter", blurb: "You wait for the beep. Most people don't." },
  { at: 1060, name: "Quietly Strong", blurb: "Nobody at work has any idea." },
  { at: 1280, name: "Grip Like A Vice", blurb: "Jars have stopped being a problem." },
  { at: 1540, name: "Bench Regular", blurb: "The gym would notice if you weren't there." },
  { at: 1840, name: "Off-Day Walker", blurb: "Rest days are a plan, not a lapse." },
  { at: 2180, name: "Reads The Numbers", blurb: "You know what you lifted last Tuesday." },
  { at: 2560, name: "Structurally Sound", blurb: "Everything is holding together nicely." },
  { at: 3000, name: "Deload Believer", blurb: "You back off before you have to. Rare." },
  { at: 3500, name: "Compound Movement Enthusiast", blurb: "You pick the hard ones on purpose." },
  { at: 4080, name: "Unreasonably Reliable", blurb: "A year of turning up will do that." },
  { at: 4740, name: "Stronger Than Last Year", blurb: "Measurably. It's in the log." },
  { at: 5500, name: "Carries All The Bags", blurb: "One trip. Always one trip." },
  { at: 6400, name: "Made Of Rebar", blurb: "Bone density says hello." },
  { at: 7450, name: "Immovable Object", blurb: "Good luck shifting you." },
  { at: 8700, name: "Long Game Merchant", blurb: "Years, not weeks. This is the whole trick." },
  { at: 10_200, name: "Local Legend", blurb: "Somebody has definitely asked you for advice." },
  { at: 12_000, name: "Absolute Unit", blurb: "Said with total respect." },
  { at: 14_500, name: "Force Of Nature", blurb: "At this point it is just who you are." },
];

export type TitleStats = {
  /** Every set she has ever logged. */
  sets: number;
  /** Every session she has finished. */
  sessions: number;
  /** Distinct days with a meal logged. */
  daysLogged: number;
  /** Consecutive weeks with at least one session. */
  streakWeeks: number;
  /** Milestones reached. */
  milestones: number;
};

/**
 * Points. Weighted so that *turning up* outscores *doing a lot in one go* —
 * a single enormous session should not outrank a month of ordinary ones,
 * because the month is the thing that actually works.
 */
export function scoreFor(s: TitleStats): number {
  return s.sets
    + s.sessions * 8
    + s.daysLogged * 2
    + s.streakWeeks * 15
    + s.milestones * 25;
}

export type Title = {
  name: string;
  blurb: string;
  /** 0–100 toward the next one; 100 at the top. */
  progress: number;
  next: string | null;
};

export function titleFor(stats: TitleStats): Title {
  const score = scoreFor(stats);
  let i = 0;
  while (i + 1 < RANKS.length && score >= RANKS[i + 1].at) i += 1;
  const here = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  const progress = next
    ? Math.max(0, Math.min(100, Math.round(((score - here.at) / (next.at - here.at)) * 100)))
    : 100;
  return { name: here.name, blurb: here.blurb, progress, next: next?.name ?? null };
}

/**
 * Consecutive weeks with at least one session, counting back from her current
 * week. A week she trained but the app was closed still counts — this reads
 * logged sessions, which is the only evidence there is.
 */
export function streakWeeks(sessionDates: ISODate[], weekStartOf: (d: ISODate) => ISODate, thisWeek: ISODate): number {
  const weeks = new Set(sessionDates.map(weekStartOf));
  let n = 0;
  const cursor = new Date(`${thisWeek}T00:00:00Z`);
  // The current week not being trained yet is not a broken streak — it is
  // Monday morning. Start from it, and stop at the first genuinely empty one
  // that is not the one she is standing in.
  for (let step = 0; step < 520; step += 1) {
    const key = cursor.toISOString().slice(0, 10) as ISODate;
    if (weeks.has(key)) n += 1;
    else if (step > 0) break;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return n;
}
