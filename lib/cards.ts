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
} as const;

export type CardId = keyof typeof CARDS;

export const isCardId = (id: string): id is CardId => Object.hasOwn(CARDS, id);

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
