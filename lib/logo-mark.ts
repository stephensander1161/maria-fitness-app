/**
 * Which mark the app wears.
 *
 * The name is the joke and the joke is load-bearing: a **plate** is the thing
 * on the end of a bar and the thing dinner is on — that is why the app is
 * called Plate at all. A pauldron is the third kind, the shoulder plate off a
 * suit of armour, and it is the same word doing the same work.
 *
 * Kept as a list rather than a boolean for the reason lib/theme.ts is a list:
 * a fourth one is then an entry, and every surface that draws the mark already
 * knows how to be handed a choice.
 *
 * The *icon* does not follow this, and cannot — a favicon is one URL for the
 * whole origin, fetched without a session and cached far longer than anyone
 * spends choosing. See the note in lib/brand.ts, which is the same argument
 * that keeps the icon off the theme.
 */
export type LogoMarkId = "arc" | "pauldron" | "roof" | "lamellar" | "stack" | "monogram";

export type LogoMarkOption = {
  id: LogoMarkId;
  name: string;
  /** One line, for the picker and for the coach's tool. */
  blurb: string;
};

export const LOGO_MARKS: LogoMarkOption[] = [
  {
    id: "arc",
    name: "Barbell plate",
    blurb: "A loaded bar on the way up. The original, and what the app is named for.",
  },
  {
    id: "pauldron",
    name: "Shoulder plate",
    blurb: "A pauldron \u2014 the plate off a suit of armour. Same word, third meaning.",
  },
  {
    id: "roof",
    name: "Temple roof",
    blurb: "The same eave, both sides. A heavy thing held up by a curve that refuses to be a triangle.",
  },
  {
    id: "lamellar",
    name: "Lamellar",
    blurb: "Overlapping plates, narrow at the top and fanning out under it.",
  },
  {
    id: "stack",
    name: "Plate stack",
    blurb: "Three bars, shortest on top. A rack of plates and a rising chart at once.",
  },
  {
    id: "monogram",
    name: "Monogram",
    blurb: "A C with plate-heavy ends \u2014 a letter at a glance, a loaded bar up close.",
  },
];

export const logoMarkIds = LOGO_MARKS.map((m) => m.id) as [LogoMarkId, ...LogoMarkId[]];

/**
 * The stored value, or the default.
 *
 * Falls back rather than throwing for the same reason `themeOf` does: a column
 * holding a value some later version removed must render *something*, and the
 * something is the one the app shipped with.
 */
export function logoMarkOf(value: string | null | undefined): LogoMarkOption {
  return LOGO_MARKS.find((m) => m.id === value) ?? LOGO_MARKS[0];
}
