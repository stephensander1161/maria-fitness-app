import type { Tone } from "@/lib/buddy";

/**
 * The app's own copy, in the register she picked.
 *
 * `profiles.coach_tone` already changed two things: how the coach writes, and
 * what the companion barks. Everything the *screens* said was written in one
 * neutral voice — so somebody who set the coach to gym-floor got a blunt coach
 * and then "Another dot on the line." from the weigh-in, which reads as two
 * different apps.
 *
 * The rule is the persona's rule, and it is not a style note: **a voice may
 * change how something is said. It may not change what is true.** No register
 * here reports a different number, and none of them shames her — the fun voice
 * to write is exactly the one that quietly turns into "no excuses", which is
 * why tests/voice.test.ts holds every line in this file to that.
 *
 * Deliberately small. Copy that carries a fact — a macro bar, a refusal, a
 * safety note — stays in one voice, because three phrasings of a warning is
 * three chances to soften it.
 */

/** A moment the app says something about, in each of the three registers. */
export type Moment = "sessionDone" | "weighedIn" | "sleepLogged" | "restOver";

type Lines = Record<Tone, readonly string[]>;

const LINES: Record<Moment, Lines> = {
  sessionDone: {
    plain: [
      "That's the whole session. Nice.",
      "Done. The hard part was starting.",
      "Session logged. That's another one in the bank.",
      "Finished. Consistency is the whole trick.",
      "Work's done. Recovery starts now.",
      "That's it — everything you planned, finished.",
      "Done and dusted.",
      "Session complete. Nothing skipped.",
      "That's the one. Same again next time.",
      "Logged. Rest is where it actually happens.",
    ],
    encouraging: [
      "You did the whole thing. That counts for a lot.",
      "Every single set. Be pleased with that.",
      "Turning up was the hard bit, and you turned up.",
      "That's a session you'll be glad you did.",
      "Lovely work. Go and rest properly.",
      "All of it, done. Your future self says thanks.",
      "That's another brick in the wall.",
      "Finished. Go and enjoy the rest of your day.",
      "Nothing skipped. That's the whole trick.",
      "Booked. Small sessions add up to everything.",
    ],
    hype: [
      "Session cooked. Everything on the list, gone.",
      "That's the work. Nobody can take it off you.",
      "Done. Bar's heavier next week.",
      "All of it. No sets left behind.",
      "Logged. That's how it's supposed to look.",
      "Every set on the board. Go eat.",
      "Work's in the bank. Recovery now.",
      "That's the session, start to finish.",
      "Done. Turning up is undefeated.",
      "Logged and put away. Same again.",
    ],
  },
  weighedIn: {
    plain: [
      "Another dot on the line.",
      "That's the data. The trend does the talking.",
      "Logged. Ten seconds well spent.",
      "One more reading the trend can lean on.",
    ],
    encouraging: [
      "Thank you — the trend gets steadier every time you do this.",
      "In it goes. That's the habit that makes the rest work.",
      "Noted. Turning up for the boring bit is the whole game.",
      "Logged. One number, no verdict.",
    ],
    hype: [
      "On the board.",
      "Logged. Data doesn't lie, and it doesn't judge.",
      "In it goes. Trend's the only thing that counts.",
      "Numbers in. Keep feeding it.",
    ],
  },
  sleepLogged: {
    plain: [
      "Written down.",
      "In it goes.",
      "Noted — that one counts as data too.",
      "That's another night the trend can lean on.",
    ],
    encouraging: [
      "Thank you — sleep explains more bad weeks than training does.",
      "Logged. That one matters more than people think.",
      "Noted, good night or bad.",
      "In it goes. The pattern is worth more than any one night.",
    ],
    hype: [
      "Logged. Sleep is the cheapest gains going.",
      "In. Recovery counts as training.",
      "Noted. Beds build more than barbells.",
      "On the board. Nights matter.",
    ],
  },
  restOver: {
    plain: ["Go"],
    encouraging: ["Ready"],
    hype: ["Go"],
  },
};

/**
 * A line for a moment, stable for a given seed.
 *
 * Seeded rather than random so it does not change while she is reading it —
 * the done screen sits on the screen until she clears it, and a sentence that
 * rewrites itself mid-read is a sentence she cannot read.
 */
export function line(moment: Moment, tone: Tone | null | undefined, seed: string): string {
  const options = LINES[moment][tone ?? "plain"] ?? LINES[moment].plain;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
}

/** Every line, for the tests that hold all three registers to the same rules. */
export const ALL_LINES = LINES;
