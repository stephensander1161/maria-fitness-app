import type { StockStatus } from "@/lib/pantry";

/**
 * The kitchen as a set of things, not two lists.
 *
 * It used to be a shopping list and a pantry list, each a column of text you
 * read top to bottom — which is the wrong shape twice over. In a supermarket
 * she is scanning for one item among thirty, and a list makes her read all
 * thirty in order. At the cupboard she is answering "have I got X", which a
 * list also answers slowly.
 *
 * So: one collection of items, each carrying its own state, filtered by what
 * kind of food it is. Same move as the movement picker — the question people
 * actually ask first is "which sort of thing", and answering that leaves a
 * handful to look at rather than the whole library.
 */

/** What a tile can be. Four states, and they are the pantry's, not new ones. */
export type KitchenState =
  /** In the kitchen: an amount, or "some" when nobody counted. */
  | "in"
  /** Known to be out. A fact worth keeping — it is why it is on the list. */
  | "out"
  /** This week's meals need it and it is not here. */
  | "need"
  /** On hand, but the amounts cannot be compared — see lib/pantry.ts. */
  | "unknown";

export type KitchenItem = {
  item: string;
  /** From the food library, for the glyph. Null when nothing matched. */
  category: string | null;
  state: KitchenState;
  /** "2 tins", "some", "out" — already in her food units. */
  label: string;
  /** What the week needs, when it needs something. */
  needed: string | null;
  /** True when she put it on the list herself rather than a meal asking. */
  extra: boolean;
  /**
   * The unit the row is stored under, or null for "no unit".
   *
   * Carried because `(profile, item, unit)` is what identifies a pantry row —
   * setting an amount without it would create a second row for the same food
   * rather than changing the one on screen.
   */
  unit: string | null;
};

/**
 * The order tiles appear in.
 *
 * What she has to do something about comes first. A kitchen screen opened in
 * a supermarket is a shopping list, and one opened at home is an inventory —
 * putting the things that need buying at the top serves the first without
 * costing the second anything, because the tiles are a grid and she can see
 * both at once.
 */
const RANK: Record<KitchenState, number> = { need: 0, out: 1, unknown: 2, in: 3 };

export function sortKitchen(items: KitchenItem[]): KitchenItem[] {
  return [...items].sort(
    (a, b) => RANK[a.state] - RANK[b.state] || a.item.localeCompare(b.item),
  );
}

/** Which tab of the food library a category belongs under. */
export const KITCHEN_GROUPS = [
  { key: "produce", label: "Produce", categories: ["vegetable", "fruit"] },
  { key: "protein", label: "Protein", categories: ["meat", "fish", "eggs", "legume"] },
  { key: "dairy", label: "Dairy", categories: ["dairy"] },
  { key: "grains", label: "Grains", categories: ["grain"] },
  { key: "cupboard", label: "Cupboard", categories: ["sauce", "fat", "nut", "snack", "drink", "prepared"] },
] as const;

export type KitchenGroup = (typeof KITCHEN_GROUPS)[number]["key"] | "other";

export function groupForFood(category: string | null): KitchenGroup {
  if (!category) return "other";
  const found = KITCHEN_GROUPS.find((g) => (g.categories as readonly string[]).includes(category));
  return found?.key ?? "other";
}

/**
 * A category for something the food library has never heard of.
 *
 * The library is nutrition data — it carries chicken breast and cheddar, not
 * cumin, chicken stock or a crusty bread roll. On a real kitchen that left
 * two fifths of everything in "Other", which is a chip you cannot use.
 *
 * This only ever picks a glyph and a chip. It is not allowed anywhere near a
 * number: guessing that something is a spice is harmless, and guessing what
 * is in it is the kind of invention this app refuses to make.
 */
const GUESSES: [RegExp, string][] = [
  [/\b(salt|pepper|cumin|paprika|chilli|chili|cinnamon|turmeric|oregano|thyme|basil|spice|herb|curry powder|garam|bay lea|nutmeg|ginger powder|seasoning)\b/i, "sauce"],
  [/\b(stock|broth|bouillon|passata|puree|purée|sauce|ketchup|mayo|mustard|vinegar|soy|sriracha|pesto|salsa|chutney|jam|honey|syrup|marmite)\b/i, "sauce"],
  [/\b(bread|roll|bagel|pitta|pita|tortilla|wrap|naan|bun|crumpet|muffin|cracker|oat|rice|pasta|noodle|couscous|quinoa|flour|cereal|granola|spaghetti|penne|macaroni|fusilli|linguine|orzo|barley)(e?s)?\b/i, "grain"],
  [/\b(oil|butter|ghee|lard|margarine)\b/i, "fat"],
  [/\b(milk|cream|yoghurt|yogurt|cheese|feta|mozzarella|parmesan|halloumi)\b/i, "dairy"],
  [/\b(egg)s?\b/i, "eggs"],
  [/\b(bean|lentil|chickpea|hummus|tofu|tempeh|pea)s?\b/i, "legume"],
  [/\b(chicken|beef|pork|lamb|turkey|bacon|sausage|chorizo|ham|mince|steak)\b/i, "meat"],
  [/\b(salmon|tuna|cod|prawn|shrimp|fish|mackerel|sardine)\b/i, "fish"],
  [/\b(apple|banana|berry|berries|orange|peach|pear|grape|melon|mango|lemon|lime|avocado|plum|kiwi|pineapple)(e?s)?\b/i, "fruit"],
  // Plurals matter more here than anywhere else: a kitchen is written in
  // them. "Bell peppers sliced" and "diced potatoes" both missed a list that
  // only knew the singular.
  [/\b(onion|garlic|carrot|potato|tomato|pepper|spinach|kale|broccoli|courgette|zucchini|cucumber|lettuce|romaine|salad|green|mushroom|cabbage|leek|celery|squash|corn|parsley|coriander|cilantro|dill|rocket|beet|asparagus|aubergine|eggplant|sprout|veg|vegetable)(e?s)?\b/i, "vegetable"],
  [/\b(nut|almond|walnut|cashew|peanut|seed|tahini)s?\b/i, "nut"],
  [/\b(water|juice|coffee|tea|squash|cordial|beer|wine)\b/i, "drink"],
  [/\b(crisp|chocolate|biscuit|sweet|cake|bar|seaweed|popcorn|pretzel)s?\b/i, "snack"],
];

export function guessCategory(item: string): string | null {
  return GUESSES.find(([test]) => test.test(item))?.[1] ?? null;
}

/**
 * A pantry status and an amount, as one state.
 *
 * `compareStock` reports "unknown" when two amounts cannot be compared —
 * grams against tins — and that is deliberately not a shortage or a surplus.
 * It stays its own state here rather than being rounded into one of the
 * other two, which is the whole reason that word exists.
 */
export function stateFor(
  onHand: { amount: number | null } | null,
  status: StockStatus | null,
): KitchenState {
  if (status === "unknown") return "unknown";
  if (!onHand) return status === null ? "need" : "need";
  if (onHand.amount === 0) return "out";
  if (status === "short" || status === "out") return "need";
  return "in";
}
