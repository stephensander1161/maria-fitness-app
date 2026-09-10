/**
 * Which subject a screen makes the most sense of.
 *
 * The card at the bottom of every page is read where she is standing, and on
 * the food screens the thing worth knowing is about food. Sleep already gets
 * this treatment by the hour; this is the same idea by place.
 *
 * Deliberately only the food ones. Train and Progress see the whole library,
 * because "one thing worth knowing" is more interesting when it is not always
 * about the screen you are looking at — the point of the card is the thing you
 * did not go looking for. Food is the exception because there is a specific
 * decision being made on those two screens, several times a day.
 */
export type FactCategory =
  | "sedentary_risk" | "strength" | "nutrition" | "recovery"
  | "motivation" | "womens_health" | "postpartum";

export function preferredCategory(path: string): FactCategory | undefined {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  return clean === "/eat" || clean === "/kitchen" ? "nutrition" : undefined;
}
