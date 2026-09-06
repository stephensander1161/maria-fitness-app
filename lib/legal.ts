/**
 * The facts the legal pages are built from, in one place so they cannot
 * disagree with each other or with the app.
 *
 * A privacy policy is only worth anything if it is true, so every entry here
 * is checked against the schema and the code rather than written from a
 * template: `THIRD_PARTIES` is the same list COMPLIANCE.md enumerates, and
 * `COLLECTED` is the tables that hold something about her.
 */
export const LEGAL = {
  appName: "Plate",
  /** Who operates the service and answers privacy requests. */
  operator: "Stephen Sander",
  contact: "stephen.sander1@gmail.com",
  jurisdiction: "Alberta, Canada",
  effectiveDate: "2026-09-06",
  minimumAge: 18,
} as const;

/** Everywhere her data goes that is not this app's own server. */
export const THIRD_PARTIES = [
  {
    name: "Anthropic",
    what: "Your conversation with the coach and a summary of your current state — today's training, your plan, your weight trend, your goal and, where you have told the app, your recovery status — are sent to Anthropic's API to generate the coach's replies. Anthropic does not use API data to train its models.",
    optional: false,
  },
  {
    name: "Neon",
    what: "Hosts the database. Everything the app stores lives there, encrypted in transit and at rest.",
    optional: false,
  },
  {
    name: "Vercel",
    what: "Hosts the app and serves every request. Vercel attaches an approximate location (city, region, country) to requests, which the app records only in its security log.",
    optional: false,
  },
  {
    name: "Google",
    what: "Only if you sign in with Google. Google tells the app your email address, your name, and that the address is verified. Nothing goes back to Google.",
    optional: true,
  },
  {
    name: "Instacart",
    what: "Only if the owner has connected it and only when you ask: the week's shopping list — item names and quantities, nothing about you — is sent to build a cart.",
    optional: true,
  },
  {
    name: "Apple, Google or Mozilla push services",
    what: "Only if you turn on a weigh-in reminder. The push carries no content at all — it wakes your device, and the words are already on it.",
    optional: true,
  },
] as const;

/** What the app holds about you, grouped the way you would think about it. */
export const COLLECTED = [
  { group: "Your account", items: ["email address", "name", "a hashed password if you set one", "a Google account identifier if you use Google sign-in", "your theme and unit preferences"] },
  { group: "About your body", items: ["birth year", "sex", "height", "weigh-ins", "tape measurements", "progress photos you choose to add", "menstrual cycle events you choose to log", "recovery after childbirth, if you tell the app", "whether you are breastfeeding, if you tell the app"] },
  { group: "Your training", items: ["your weekly plan", "every set you log", "how sessions felt", "injuries and niggles you report", "equipment you have"] },
  { group: "Your food", items: ["meal plans", "meals you log", "foods you dislike and dietary restrictions", "what is in your kitchen", "saved meals and batches"] },
  { group: "The coach", items: ["your full conversation with the coach", "what the coach spent, so the app can cap it"] },
  { group: "Friends", items: ["who you are sharing training with", "a share code you can reset"] },
  { group: "Security", items: ["sign-in attempts, with the address they came from and an approximate location", "a truncated browser identifier", "what you asked the app for and whether it shipped"] },
] as const;

/** What a friend can see, stated as a closed list because it is one. */
export const FRIENDS_SEE = [
  "sessions this week", "hard sets this week", "your streak", "lifetime sessions", "your rank", "this week's heaviest lifts",
] as const;
