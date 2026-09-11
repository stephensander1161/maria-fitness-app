/**
 * Cards she can fold away, remembered on the account.
 *
 * Everything starts expanded. A card that opens closed is a card she has to
 * discover, and the screen's own emptiness is what teaches her the feature
 * exists — so the default is open and only a deliberate tap puts one away.
 *
 * Stored as a list of ids on the profile rather than a boolean column each,
 * so the next card that wants this needs no migration, and on the *account*
 * rather than in localStorage so the choice follows her between her phone and
 * a laptop — the same reason the theme lives there.
 */
export const CARDS = {
  plannedFood: "Planned for today, on the Eat screen",
  mealRationale: "Why this plan, the write-up on the Plan screen's food tab",
} as const;

/**
 * Cards there can be any number of, addressed by what they are about.
 *
 * A movement card per movement cannot be an entry in the list above — the list
 * is the app's own furniture, and the library has 188 movements and gains more.
 * So this family is matched by shape instead, and the shape is narrow: a known
 * prefix and a slug, nothing that could collide with a fixed id and nothing
 * that could grow without bound from a typo.
 */
const FAMILIES: Record<string, RegExp> = {
  movement: /^movement:[a-z0-9-]{1,80}$/,
};

export type CardId = keyof typeof CARDS | `movement:${string}`;

export const isCardId = (id: string): id is CardId =>
  Object.hasOwn(CARDS, id)
  || Object.entries(FAMILIES).some(([prefix, shape]) => id.startsWith(`${prefix}:`) && shape.test(id));

/** The card id for one movement's card. */
export const movementCard = (slug: string): CardId => `movement:${slug}`;

/** Open unless she has said otherwise. */
export const cardOpen = (collapsed: readonly string[] | null | undefined, id: CardId): boolean =>
  !(collapsed ?? []).includes(id);

/** The new list after a toggle. Idempotent, and never grows duplicates. */
export function withCard(
  collapsed: readonly string[] | null | undefined,
  id: CardId,
  open: boolean,
): string[] {
  const without = (collapsed ?? []).filter((c) => c !== id);
  return open ? without : [...without, id];
}
