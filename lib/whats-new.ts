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
    id: "2026-09-10-food-facts",
    date: "2026-09-10",
    title: "Sixteen more food facts, and the card reads the room",
    blurb: "On Eat and Kitchen the thing worth knowing is about food, so that is what the card shows there — cooking loss, what a drizzle of oil actually costs, why a salty dinner moves the scale a kilo overnight. Every other screen still gets the whole library, because the point of the card is the thing you did not go looking for.",
    href: "/eat",
  },
  {
    id: "2026-09-10-chat-controls",
    date: "2026-09-10",
    title: "Ask your coach from the food card, and take a message back",
    blurb: "A chat button sits beside Add food, so a plate with four things on it does not mean scrolling to the bottom of the screen. In the conversation, replaying a message now rewinds to it rather than asking the same thing twice, there is a copy button beside it, and a turn that is taking too long can be stopped.",
    href: "/eat",
  },
  {
    id: "2026-09-10-plate-pricing",
    date: "2026-09-10",
    title: "A whole plate logged in one go, and portions that mean one",
    blurb: "Telling your coach what you ate used to be a separate lookup per food and a round trip to read them back, which is what pushed one lunch past its deadline. It prices the plate from the library in a single call now. And a food with no amount means one of it — one hot dog is 131 calories, not the 290 that 100g of sausage would be.",
    href: "/eat",
  },
  {
    id: "2026-09-10-refused-writes",
    date: "2026-09-10",
    title: "If something did not save, your coach says so",
    blurb: "A lunch was refused because the turn ran out of time, and the coach reported it as logged — the row was never there. Saving now gets almost the whole turn rather than being the first thing dropped, and a refusal can no longer be read as \"tell her it is done\".",
    href: "/eat",
  },
  {
    id: "2026-09-10-streak-counts-work",
    date: "2026-09-10",
    title: "Your streak counts the work, not the button",
    blurb: "One Progress screen said \"3 of 6 sessions\" and \"2 day streak\" about the same three days of training — because Monday had twenty sets logged and no Finish pressed, so it counted for one number and not the other. Every count in the app now uses the same rule: a session with work in it happened.",
    href: "/progress",
  },
  {
    id: "2026-09-10-whole-library",
    date: "2026-09-10",
    title: "Every movement is addable, whatever you said you own",
    blurb: "Answering \"dumbbells\" once during setup meant the barbell bench press did not exist in the app — which is wrong if you buy a rack, or train somewhere on Thursdays that has everything. The picker shows the whole library now and says \"needs barbell\" instead of hiding it. Your kit still steers what your coach programs; it no longer decides what you are allowed to log.",
    href: "/train",
  },
  {
    id: "2026-09-09-neutral-icon",
    date: "2026-09-09",
    title: "The tab icon is neutral now",
    blurb: "It was the app's orange, so picking Turquoise left an orange square in the browser tab. It cannot follow your theme — a favicon is one image for the whole site, cached by the browser — so it is the mark in black on white, which reads on light chrome and dark. The address bar colour does still follow your theme.",
    href: "/settings",
  },
  {
    id: "2026-09-09-five-themes",
    date: "2026-09-09",
    title: "Eight more looks, and only one of them is orange",
    blurb: "Four of the first seven had an orange accent, which is one theme with four backgrounds. Orchid, Moss and Slate follow Dusk's recipe — a base tinted toward its own accent and a glow in the corner; Turquoise, Rose and Cobalt are dark, Ink and Plum light. All of them clear the same contrast floors as the rest.",
    href: "/settings",
  },
  {
    id: "2026-09-09-instant-set",
    date: "2026-09-09",
    title: "A set appears the moment you log it",
    blurb: "The square used to wait for the save and then for the screen to fetch itself again — so nothing happened for a beat and then everything changed at once, which felt like the page reloading. It goes in on the tap now, and comes back out with the error if the save actually fails.",
    href: "/train",
  },
  {
    id: "2026-09-09-steady-beat",
    date: "2026-09-09",
    title: "The green marker beats at one steady tempo",
    blurb: "It used to run fast just after a set and settle as the rest counted down, which on a card the size of your hand looked less like a pulse and more like a sign shorting out. One slow rhythm the whole way through now.",
    href: "/train",
  },
  {
    id: "2026-09-09-coach-in-his-box",
    date: "2026-09-09",
    title: "The coach's two buttons live with him now",
    blurb: "\"Coach's read\" and the speech bubble were a pair in every page's header. They sit in the corner of the figure's strip instead, on every screen — and on Train that means the row of arrows above the session is gone: the day's name, its date and the way to another day are all in the one card now.",
    href: "/train",
  },
  {
    id: "2026-09-09-bow-extension",
    date: "2026-09-09",
    title: "Bow Extension is its own movement",
    blurb: "It was a search term pointing at the overhead triceps extension, so looking for it found something else entirely. It is a movement in the library now — standing, arms overhead, knee driven up to the elbow — with a figure drawn face-on so you can see both legs.",
    href: "/learn",
  },
  {
    id: "2026-09-09-higher-is-green",
    date: "2026-09-09",
    title: "The better of the two sets is the one that lights up",
    blurb: "A set under last week's used to take a full red fill, which turned an ordinary day into a row of red. Now only the higher number is marked, in green — and where last time was the better one, it says so with a quiet green rule under it rather than shouting.",
    href: "/train",
  },
  {
    id: "2026-09-09-last-time-under",
    date: "2026-09-09",
    title: "Last time, directly under today's sets",
    blurb: "Set three sits above set three, column for column. Green is the bigger of the two and red the smaller, so whether you are up or down on last week is a glance rather than arithmetic — and a set that cannot be compared with the one before it stays grey rather than guessing.",
    href: "/train",
  },
  {
    id: "2026-09-09-high-fives",
    date: "2026-09-09",
    title: "Send a friend a high five",
    blurb: "A button on every friend's card. They see it the next time they open Friends, with who sent it — nothing to reply to, nothing to keep up with. It travels with the training you already share, and never anything about your body.",
    href: "/friends",
  },
  {
    id: "2026-09-09-friends-stats",
    date: "2026-09-09",
    title: "Friends actually show what they have done",
    blurb: "A friend's card counted only sessions where they had pressed Finish, so someone training four times a week showed as nothing. It counts the work now, and carries volume, movements, lifetime sets, when they last trained, and their heaviest ever.",
    href: "/friends",
  },
  {
    id: "2026-09-09-pause",
    date: "2026-09-09",
    title: "Pause a session, and drag cards on a desktop",
    blurb: "A pause button sits beside Finish while you train, and the time it is stopped for comes off what the session is reported as. Reordering movements by dragging now works on a wide screen too, where the day is laid out as a grid.",
    href: "/train",
  },
  {
    id: "2026-09-08-buddy-sleeps",
    date: "2026-09-08",
    title: "He sleeps, and he trains when you do",
    blurb: "The cartwheel is gone. He turns in at night and on days with nothing planned, and he stops doing sets at you when you are not training. Start a workout and he is up and doing it with you, whatever the hour.",
    href: "/train",
  },
  {
    id: "2026-09-08-buddy",
    date: "2026-09-08",
    title: "One of him, and he knows how you're doing",
    blurb: "The crowd at the bottom of the screen is one figure again — and now he is the size of your last fortnight of training, fills up as you log protein, and says the one thing most worth saying. Never a random line: whatever he tells you is read off your own numbers.",
    href: "/train",
  },
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
