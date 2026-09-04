/**
 * How the app looks.
 *
 * The palettes live in app/globals.css as `html[data-theme="…"]` blocks —
 * nineteen custom properties each, all of them *roles* rather than colours.
 * This module is the list the screens and the coach choose from, and the one
 * place that decides what happens when the stored value is nonsense.
 *
 * Every theme is held to the same contrast floors by
 * tests/accessibility.test.ts, computed from the tokens rather than eyeballed,
 * so a pretty theme that fails them fails the build. That is the whole reason
 * a theme is a fixed list and not a colour picker.
 */

export type ThemeId =
  | "midnight" | "daylight" | "paper" | "ember" | "tide" | "dusk" | "contrast";

export type Theme = {
  id: ThemeId;
  name: string;
  /** One line, in her language, about when you would pick it. */
  blurb: string;
  scheme: "dark" | "light";
  /** Three colours for the swatch: background, surface, accent. */
  swatch: [string, string, string];
  /** The browser chrome colour when the app is installed to a home screen. */
  themeColor: string;
};

export const THEMES: Theme[] = [
  {
    id: "midnight", name: "Midnight", scheme: "dark",
    blurb: "The original. Dark and high contrast, built for a gym at 6am.",
    swatch: ["#0b0e13", "#141920", "#ff6a45"], themeColor: "#0b0e13",
  },
  {
    id: "daylight", name: "Daylight", scheme: "light",
    blurb: "Plain light. What most people mean by light mode.",
    swatch: ["#f6f8fa", "#ffffff", "#c2410c"], themeColor: "#f6f8fa",
  },
  {
    id: "paper", name: "Paper", scheme: "light",
    blurb: "Warm light, easier on the eyes by a bright window than pure white.",
    swatch: ["#f4efe4", "#fffdf7", "#9a4a17"], themeColor: "#f4efe4",
  },
  {
    id: "ember", name: "Ember", scheme: "dark",
    blurb: "Warm dark, with a low fire at the top of the page.",
    swatch: ["#150d0a", "#201511", "#ff7a45"], themeColor: "#150d0a",
  },
  {
    id: "tide", name: "Tide", scheme: "dark",
    blurb: "Cool and deep. The calmest of the dark ones.",
    swatch: ["#08131e", "#0f1e2c", "#38bdf8"], themeColor: "#08131e",
  },
  {
    id: "dusk", name: "Dusk", scheme: "dark",
    blurb: "Violet, and the furthest an accent gets from the green that means done.",
    swatch: ["#0e0a18", "#171226", "#c084fc"], themeColor: "#0e0a18",
  },
  {
    id: "contrast", name: "High contrast", scheme: "dark",
    blurb: "Maximum separation, no gradients, for glare or for tired eyes.",
    swatch: ["#000000", "#0d0d0d", "#ffb020"], themeColor: "#000000",
  },
];

export const DEFAULT_THEME: ThemeId = "midnight";

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === "string" && BY_ID.has(value as ThemeId);

/**
 * The theme to render. Anything unrecognised — a null column on an old row, a
 * theme removed in a later version, a hand-edited database — falls back rather
 * than rendering an unstyled page, which is the one outcome worse than the
 * wrong colours.
 */
export const themeOf = (value: string | null | undefined): Theme =>
  BY_ID.get((value ?? "") as ThemeId) ?? BY_ID.get(DEFAULT_THEME)!;

export const themeIds = THEMES.map((t) => t.id) as [ThemeId, ...ThemeId[]];
