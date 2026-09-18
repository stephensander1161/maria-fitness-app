import type { ISODate } from "@/lib/date";

/**
 * A rank that goes up as she keeps showing up.
 *
 * The sidebar used to say the app's own name above her name, which
 * tells her nothing. This says something about her instead, and it changes —
 * a small reason to look at it.
 *
 * Three rules, and they are the whole design:
 *
 * 1. **It is earned, not accumulated.** A title used to be a count of things
 *    that had happened — every set, every logged day — so the score went up
 *    whatever the week actually looked like. It reads the *quality* of the
 *    inputs now: a day inside her calorie target is worth something, a day
 *    over it costs, a planned session that came and went with nothing logged
 *    costs, and a day logged in words carries neither because nobody knows
 *    what was in it. See `POINTS`.
 * 2. **A title is never taken away.** The score can fall — that is the point
 *    of rule 1 — but the *name* is floored at the highest rank she has been
 *    told about, so a bad fortnight stalls and reverses the bar toward the
 *    next one and never demotes her. An app that takes a title away for
 *    missing sessions punishes the exact moment she most needs a reason to
 *    come back; an app whose bar never moves backwards is not measuring
 *    anything.
 * 3. **It is never the joke.** These are meant to be funny about the *doing* —
 *    a bar that keeps getting heavier, a routine that has become a habit —
 *    and never about her body, her weight, her speed, or how far along she is.
 *    Nothing here reads as sarcastic if you are struggling.
 *
 * And one thing it deliberately does not do: **say how many there are.** "7 of
 * 30" turns a title into a progress bar with a finish line on it, and puts a
 * number on how much of the thing she has not done. The rank has a number
 * because being the seventh means something; the ceiling is nobody's business.
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
  /**
   * Planned training days that came and went with nothing logged on them.
   *
   * Rest days and days with no movements on them are not misses — a rest day
   * is the plan working. Only a day the plan asked her to train on.
   */
  missedSessions: number;
  /** Fully-counted days that came in at or under the calorie target. */
  daysOnTarget: number;
  /** Fully-counted days that went over it. */
  daysOver: number;
  /**
   * Days with food logged that carried no figures at all.
   *
   * Unknown is not zero, and it is not a failure either: "leftovers" is an
   * honest entry about a meal nobody measured. It earns the small credit for
   * logging and is judged no further. See the rule in CLAUDE.md.
   */
  daysUncounted: number;
  /** Consecutive weeks with at least one session. */
  streakWeeks: number;
  /** Milestones reached. */
  milestones: number;
};

/**
 * What each input is worth.
 *
 * Weighted so that *turning up* outscores *doing a lot in one go* — a single
 * enormous session should not outrank a month of ordinary ones, because the
 * month is the thing that actually works.
 *
 * The two negatives are deliberately smaller than the positives they mirror.
 * A miss has to cost something or the bar is not measuring anything, but three
 * sessions and one missed one is still a good week and the number has to say
 * so. Set them equal and a fortnight off wipes a month of work, which is the
 * failure this app is most careful about.
 *
 * A day logged in words is worth `dayUncounted` whichever way it went, because
 * nobody knows which way it went.
 */
export const POINTS = {
  set: 1,
  session: 8,
  missedSession: -5,
  dayOnTarget: 4,
  dayOver: -2,
  dayUncounted: 1,
  streakWeek: 15,
  milestone: 25,
} as const;

export function scoreFor(s: TitleStats): number {
  return s.sets * POINTS.set
    + s.sessions * POINTS.session
    + s.missedSessions * POINTS.missedSession
    + s.daysOnTarget * POINTS.dayOnTarget
    + s.daysOver * POINTS.dayOver
    + s.daysUncounted * POINTS.dayUncounted
    + s.streakWeeks * POINTS.streakWeek
    + s.milestones * POINTS.milestone;
}

/** Which rank a score sits in. */
export function rankIndexFor(score: number): number {
  let i = 0;
  while (i + 1 < RANKS.length && score >= RANKS[i + 1].at) i += 1;
  return i;
}

export type Title = {
  name: string;
  blurb: string;
  /** 0–100 toward the next one; 100 at the top. */
  progress: number;
  next: string | null;
};

/**
 * The rank to show her.
 *
 * `floorAt` is the threshold of the highest rank she has already been told
 * about — `profiles.title_seen_at`. The score can now fall, and rule 2 above
 * is that the *name* never does: a red fortnight walks the bar back toward
 * the title she holds and stops there. Without the floor the app would greet
 * her one morning with a smaller title than the one it congratulated her on,
 * which is the single most demoralising thing a screen like this can do.
 */
export function titleFor(stats: TitleStats, floorAt: number | null = null): Title {
  const score = scoreFor(stats);
  const i = Math.max(rankIndexFor(score), floorAt === null ? 0 : rankIndexFor(floorAt));
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

/**
 * The rank she has just crossed into, or null.
 *
 * `seenAt` is the threshold of the rank she was last shown. Null is a person
 * the app has never told, and that is *not* a celebration: a new account is
 * already "Just Started" the moment it exists, and confetti for signing up is
 * the kind of praise that teaches her to ignore the real thing later. The
 * caller stamps it silently instead.
 *
 * Only ever forward. Every input to `scoreFor` is a lifetime total so the
 * score cannot fall, but this refuses to look backwards regardless — if that
 * ever changes, a bad fortnight must not produce a "you are now Rep Counter"
 * screen for a rank she is dropping into.
 */
export function newRankFor(stats: TitleStats, seenAt: number | null): Rank | null {
  const here = RANKS[rankIndexFor(scoreFor(stats))];
  if (seenAt === null) return null;
  return here.at > seenAt ? here : null;
}

/**
 * Where a rank sits in the list, for "your 12th title".
 *
 * The number without the total, on purpose — see the note at the top of this
 * file. It used to read "12 of 30".
 */
export const rankNumber = (rank: Rank): number => RANKS.findIndex((r) => r.at === rank.at) + 1;

/**
 * Where an experienced lifter starts.
 *
 * The first six ranks exist for the person for whom week two is the danger:
 * they come fast so that nothing about starting feels like standing still.
 * Hand them to someone who has trained for five years and they read as the
 * app not having listened — "Showed Up Twice" for a person who has shown up
 * a thousand times. "If a 5-year vet uses the app they don't need the silly
 * early titles, they can skip ahead."
 *
 * So what she said about her experience on the first screen sets the floor
 * (`profiles.title_seen_at`, the same one rule 2 uses): a returning lifter
 * starts at "Owns Gym Shoes", an intermediate at "Habit In Progress", an
 * advanced one at "Progressive Overloader". Not further — the later ranks
 * are earned in this log or not at all, and the bar from the floor to the
 * next rank starts empty, so there is still something to do on day one.
 */
export type Experience = "beginner" | "returning" | "intermediate" | "advanced";

export function startingRankFor(experience: Experience | null | undefined): Rank {
  const name = experience === "returning" ? "Owns Gym Shoes"
    : experience === "intermediate" ? "Habit In Progress"
      : experience === "advanced" ? "Progressive Overloader"
        : RANKS[0].name;
  return RANKS.find((r) => r.name === name) ?? RANKS[0];
}
