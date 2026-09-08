import type { ISODate } from "@/lib/date";

/**
 * What changed, for the people it changed for.
 *
 * The "you asked for this" bubble covers what somebody requested. Everything
 * else ships silently — a dozen features in two days, and nobody in the house
 * knows the themes or the recovery section exist unless they stumble on
 * them. This is the once-per-person note for the rest.
 *
 * Newest first. `id` is what a profile remembers having seen, so an entry's
 * id must never change once shipped. An account created after an entry's date
 * does not see it: it was never "new" to them.
 */
export type WhatsNew = {
  id: string;
  date: ISODate;
  title: string;
  blurb: string;
  /** Where to go and look. */
  href?: string;
  /** Only shown to people it applies to. */
  audience?: "everyone" | "recovering" | "owner";
};

export const WHATS_NEW: WhatsNew[] = [
  {
    id: "2026-09-08-morning-weigh-in",
    date: "2026-09-08",
    title: "The scale asks you, once a morning",
    blurb: "Open the app for the first time in a day and it asks for your weight, full screen, before anything else. Once you have logged it, or said not today, it goes away until tomorrow. Nothing before 5am, so training past midnight is never interrupted.",
    href: "/progress",
  },
  {
    id: "2026-09-08-movement-page",
    date: "2026-09-08",
    title: "A movement gets its own screen on a phone",
    blurb: "Tapping a movement on Train now opens a page rather than a sheet over the day, with the movement either side of it at the bottom — so you work through a session without going back to the list between sets. The back button works. On a desktop the card still opens where it sits.",
    href: "/train",
  },
  {
    id: "2026-09-08-milestones",
    date: "2026-09-08",
    title: "The steps between here and your goal",
    blurb: "Your goal weight now comes with a ladder — five pounds at a time, or two kilos, counting the way you are actually going. Rungs tick themselves off as your trend passes them, and the goal is yours to change from Progress whenever you want.",
    href: "/progress",
  },
  {
    id: "2026-09-07-recipe-photo",
    date: "2026-09-07",
    title: "Photograph a recipe, get the numbers",
    blurb: "Point your camera at a recipe page, a label, or the plate itself. You get calories and macros per serving with the assumptions behind them, and log it if it looks right. The photo isn't kept.",
    href: "/eat",
  },
  {
    id: "2026-09-07-phone-menu",
    date: "2026-09-07",
    title: "Every screen from the top of the phone",
    blurb: "The menu button now carries Train, Eat, Plan, Progress, Kitchen and Learn as well — so the app still works in a browser whose own toolbar covers the bottom bar.",
  },
  {
    id: "2026-09-07-replay",
    date: "2026-09-07",
    title: "Send a message to your coach again",
    blurb: "A small ↻ beside anything you have said. Tap it to ask the same thing again instead of retyping it.",
  },
  {
    id: "2026-09-06-privacy",
    date: "2026-09-06",
    title: "Your data, in writing",
    blurb: "A privacy page that says exactly what the app holds and where it goes, and a way to delete your account entirely from Settings.",
    href: "/privacy",
  },
  {
    id: "2026-09-05-pull-ups",
    date: "2026-09-05",
    title: "Every pull-up, as a ladder",
    blurb: "Sixteen variations from a dead hang to a muscle-up, each linked to the step before and after it. Search \"pull up\" in the library.",
    href: "/learn",
  },
  {
    id: "2026-09-05-plate",
    date: "2026-09-05",
    title: "It's called Plate now",
    blurb: "A barbell plate and a dinner plate — the two halves of what this does. New mark, same coach.",
  },
  {
    id: "2026-09-05-holds",
    date: "2026-09-05",
    title: "Holds count in seconds",
    blurb: "Planks, wall sits and carries log how long you held them, not reps.",
    href: "/train",
  },
  {
    id: "2026-09-05-burn",
    date: "2026-09-05",
    title: "What a session cost",
    blurb: "An estimate of calories burned, on Eat and on Progress. Never added to what you can eat — the app already measures that from your weight trend.",
    href: "/progress",
  },
  {
    id: "2026-09-04-recovery",
    date: "2026-09-04",
    title: "Coming back from birth",
    blurb: "A Recovery section for after childbirth: what to work on, what to leave for now, and when running is sensible. Tell the app in Settings if it applies.",
    href: "/recovery",
  },
  {
    id: "2026-09-04-themes",
    date: "2026-09-04",
    title: "Seven looks",
    blurb: "Light, dark, warm, cool and a high-contrast one for glare. Settings → Theme.",
    href: "/settings",
  },
  {
    id: "2026-09-04-friends",
    date: "2026-09-04",
    title: "Train with a friend",
    blurb: "Share sessions, streaks and best lifts with someone you know — training only, never weight or food. Swap codes under Friends.",
    href: "/friends",
  },
];

/** Entries this person has not seen and that apply to them. */
export function unseen(
  seenId: string | null,
  profile: { createdAt: Date; recovering: boolean; owner: boolean },
  entries: WhatsNew[] = WHATS_NEW,
): WhatsNew[] {
  const created = profile.createdAt.toISOString().slice(0, 10);
  const seenAt = seenId ? entries.findIndex((e) => e.id === seenId) : -1;
  // Newest first, so everything before the seen index is newer than it. A
  // seen id that no longer exists (an entry was removed) means show nothing
  // older than "unknown", which is the safe reading.
  const fresh = seenAt === -1 && seenId ? [] : entries.slice(0, seenAt === -1 ? entries.length : seenAt);
  return fresh.filter((e) =>
    e.date > created &&
    (e.audience === undefined || e.audience === "everyone"
      || (e.audience === "recovering" && profile.recovering)
      || (e.audience === "owner" && profile.owner)));
}

export const LATEST_ID = WHATS_NEW[0]?.id ?? null;
