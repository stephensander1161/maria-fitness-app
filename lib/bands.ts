/**
 * Resistance band strengths, and how to write them short.
 *
 * Maria's words: "have a space to specify the strength of the resistance band,
 * such as light, heavy, extra heavy". A band has no weight, so without this a
 * set on the light band and a set on the extra heavy are the same row — the
 * one thing that actually changed between them was not recorded anywhere.
 *
 * Strength rather than colour, deliberately. Colour is the thing people read
 * off the band in their hand, and it is also the thing no two manufacturers
 * agree on: red is the second lightest in one set and the second heaviest in
 * another. The order here is the only claim being made, and it is the one
 * every set agrees on.
 */
export const BANDS = [
  { value: "extra light", short: "XL" },
  { value: "light", short: "L" },
  { value: "medium", short: "M" },
  { value: "heavy", short: "H" },
  { value: "extra heavy", short: "XH" },
] as const;

export type BandStrength = (typeof BANDS)[number]["value"];

/** The short form, for a set square with no room for "extra heavy". */
export function bandShort(value: string | null | undefined): string | null {
  return BANDS.find((b) => b.value === value)?.short ?? null;
}
