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
  /*
    The two on Train that fold all the way to nothing.

    Both already open closed, at one line each, which is exactly why they had
    no way out: nothing that cheap looks worth a setting until you are the
    person scrolling past both of them four times a week. For these two,
    "folded" means not drawn at all — there is no smaller state left to reach.
  */
  warmUp: "The warm-up block on the Train screen",
  coolDown: "The cool-down block on the Train screen",
  /*
    "Moved up" and "Came up short" on Progress — the week's set-by-set
    review. Same rule as the two above: hidden means not drawn at all, and
    the way back is Settings or asking. "Add option to hide the 'moved up and
    came up short' section."
  */
  weekReview: "Against last week — each movement's volume against the week before, on the Progress screen",
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
  /**
   * "She opened this one on purpose."
   *
   * A movement card folds itself once its sets are done, which needs three
   * states and not two: folded, open, and *nobody has said*. Presence in the
   * list means folded, absence means nobody has said — so an explicit open
   * has nowhere to live, and without it the card she deliberately opened
   * folds itself again the moment the page reloads.
   */
  open: /^open:movement:[a-z0-9-]{1,80}$/,
};

export type CardId = keyof typeof CARDS | `movement:${string}` | `open:movement:${string}`;

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

/**
 * Whether a movement's card is folded.
 *
 * Finishing a movement folds it: she has done it, and the sets she logged are
 * the least useful thing on the screen from that moment on. But a decision she
 * has actually made outranks that in both directions — a card she folded
 * stays folded even half-done, and one she opened stays open even finished.
 */
export function movementFolded(
  cards: readonly string[] | null | undefined,
  slug: string,
  complete: boolean,
): boolean {
  const list = cards ?? [];
  if (list.includes(movementCard(slug))) return true;
  if (list.includes(openedCard(slug))) return false;
  return complete;
}

/** The marker for a movement she opened on purpose. */
export const openedCard = (slug: string): CardId => `open:movement:${slug}`;

/**
 * The list after she folds or opens one movement.
 *
 * Written as a pair, in one update, because the two markers contradict each
 * other and a list holding both is a state no reader can resolve.
 */
export function withMovementFold(
  cards: readonly string[] | null | undefined,
  slug: string,
  folded: boolean,
): string[] {
  const shut = movementCard(slug);
  const open = openedCard(slug);
  const without = (cards ?? []).filter((c) => c !== shut && c !== open);
  return [...without, folded ? shut : open];
}

/**
 * The cards on a screen, in her order.
 *
 * "Should we make all cards on all pages reorganisable?" For the two screens
 * she lives in, yes: what wants to be on top at 6am is personal, and Train
 * and Eat stack the most. Not free drag — on a scrolling phone page a drag
 * fights the scroll, and the movements inside Train already have one — but
 * a list per screen she can walk a card up or down, or hide, from the panel
 * at the foot of the screen or by asking the coach (`arrange_cards`).
 *
 * The list is the app's own furniture, named here so a typo cannot invent a
 * card. Hidden is kept separate from *folded* (the lists above): a folded
 * card is still there at one line, a hidden one is not drawn. The two on
 * Train that already had a hide — the warm-up and cool-down — keep it where
 * it was, in `collapsed_cards`, so the Settings screen and the icon on the
 * card go on working; `cardShown` reads both.
 */
export type Page = "train" | "eat";

export type PageCard = { id: string; label: string; hideable: boolean };

export const PAGE_CARDS: Record<Page, readonly PageCard[]> = {
  train: [
    { id: "warmUp", label: "Warm-up", hideable: true },
    { id: "movements", label: "Today's movements", hideable: false },
    { id: "coolDown", label: "Cool-down", hideable: true },
    { id: "addExercise", label: "Add a movement", hideable: true },
    { id: "summary", label: "Session summary", hideable: true },
  ],
  eat: [
    { id: "todayFood", label: "Today's food", hideable: false },
    { id: "plannedFood", label: "Planned meals", hideable: true },
    { id: "calculator", label: "Calorie calculator", hideable: true },
    { id: "burn", label: "Training burn", hideable: true },
  ],
};

/** Per screen: the order she chose, and what she hid. Absent means the default. */
export type CardLayout = Partial<Record<Page, { order?: string[]; hidden?: string[] }>>;

/** Cards whose hide lives in `collapsed_cards` from before this existed. */
const LEGACY_HIDE = new Set(["warmUp", "coolDown"]);

export const isPageCard = (page: Page, id: string): boolean =>
  PAGE_CARDS[page].some((c) => c.id === id);

/**
 * The screen's cards in her order. Anything she ordered comes first, in that
 * order; anything she never mentioned — a card added after she arranged the
 * screen — follows in the default order. Nothing unknown survives.
 */
export function orderFor(page: Page, layout: CardLayout | null | undefined): string[] {
  const known = PAGE_CARDS[page].map((c) => c.id);
  const saved = (layout?.[page]?.order ?? []).filter((id) => known.includes(id));
  return [...saved, ...known.filter((id) => !saved.includes(id))];
}

/** Whether a card is drawn at all. */
export function cardShown(
  page: Page,
  layout: CardLayout | null | undefined,
  collapsed: readonly string[] | null | undefined,
  id: string,
): boolean {
  if (LEGACY_HIDE.has(id) && (collapsed ?? []).includes(id)) return false;
  return !(layout?.[page]?.hidden ?? []).includes(id);
}

/** The layout after one card moves. A move off either end is a no-op. */
export function withMoved(
  page: Page,
  layout: CardLayout | null | undefined,
  id: string,
  move: "up" | "down" | "top" | "bottom",
): CardLayout {
  const order = orderFor(page, layout);
  const i = order.indexOf(id);
  if (i < 0) return { ...(layout ?? {}) };
  const to = move === "top" ? 0 : move === "bottom" ? order.length - 1 : Math.max(0, Math.min(order.length - 1, i + (move === "up" ? -1 : 1)));
  const next = [...order];
  next.splice(i, 1);
  next.splice(to, 0, id);
  return { ...(layout ?? {}), [page]: { ...(layout?.[page] ?? {}), order: next } };
}

/**
 * The layout and the collapsed list after a card is hidden or shown.
 *
 * A card that cannot be hidden is left as it is. The two legacy cards write
 * to `collapsed_cards`, where their hide has always lived; everything else to
 * the layout. Both are returned so one update writes both.
 */
export function withHidden(
  page: Page,
  layout: CardLayout | null | undefined,
  collapsed: readonly string[] | null | undefined,
  id: string,
  hidden: boolean,
): { layout: CardLayout; collapsed: string[] } {
  const card = PAGE_CARDS[page].find((c) => c.id === id);
  const base = { layout: { ...(layout ?? {}) }, collapsed: [...(collapsed ?? [])] };
  if (!card || !card.hideable) return base;
  if (LEGACY_HIDE.has(id)) return { ...base, collapsed: withCard(collapsed, id as CardId, !hidden) };
  const was = (layout?.[page]?.hidden ?? []).filter((h) => h !== id);
  return {
    ...base,
    layout: { ...(layout ?? {}), [page]: { ...(layout?.[page] ?? {}), hidden: hidden ? [...was, id] : was } },
  };
}
