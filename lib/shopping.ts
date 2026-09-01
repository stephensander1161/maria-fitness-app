/**
 * Turning a week of ingredient lines into a list you can shop from.
 *
 * The important difference from lib/portion.ts: that one converts to grams so
 * calories can be worked out. This one must NOT. A shopping list adds like
 * with like — "4 eggs" plus "2 eggs" is six eggs, not 300 grams of egg — and
 * converting would produce a list nobody can take to a shop.
 *
 * Lines that carry no quantity ("cherry tomatoes", "salt and pepper") are kept
 * as they are rather than guessed at. She knows how many tomatoes she wants;
 * inventing a number would be worse than leaving it to her.
 */

export type IngredientLine = {
  /** Null when the line names no quantity at all. */
  amount: number | null;
  /** The unit as written — "g", "tbsp", "slices" — or null for bare counts. */
  unit: string | null;
  /** What to buy. */
  item: string;
};

export type ShoppingItem = IngredientLine & {
  /** How many meals in the week call for it. */
  fromMeals: number;
};

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 0.125,
};

/** Units that attach directly to the number: "120g", "150ml". */
const TIGHT_UNITS = ["g", "kg", "ml", "l", "oz", "lb"];

/** Units written as a separate word. Kept as written for the list. */
const WORD_UNITS = new Set([
  "g", "kg", "ml", "l", "oz", "lb", "lbs",
  "tsp", "tsps", "teaspoon", "teaspoons",
  "tbsp", "tbsps", "tablespoon", "tablespoons",
  "cup", "cups", "slice", "slices", "tin", "tins", "can", "cans",
  "pouch", "pouches", "scoop", "scoops", "handful", "handfuls",
  "clove", "cloves", "sprig", "sprigs", "pot", "pots", "jar", "jars",
  "fillet", "fillets", "rasher", "rashers", "square", "squares",
  "bunch", "bunches", "pack", "packs", "punnet", "punnets",
]);

/** Words in front of the food that are not part of its name. */
const LEADING_NOISE = /^(of|a|an|the|some|large|small|medium|big|fresh|ripe)\s+/i;

function readAmount(text: string): { amount: number; rest: string } | null {
  const t = text.trimStart();

  // "1 1/2 cups" — a whole number followed by a vulgar fraction.
  const mixed = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\b/);
  if (mixed) {
    const value = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    return { amount: value, rest: t.slice(mixed[0].length) };
  }

  // "1/2 cup"
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)\b/);
  if (frac) {
    return { amount: Number(frac[1]) / Number(frac[2]), rest: t.slice(frac[0].length) };
  }

  // "1½", "½"
  const uni = t.match(/^(\d*)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛])/);
  if (uni) {
    const whole = uni[1] ? Number(uni[1]) : 0;
    return { amount: whole + UNICODE_FRACTIONS[uni[2]], rest: t.slice(uni[0].length) };
  }

  const plain = t.match(/^(\d+(?:\.\d+)?)/);
  if (plain) return { amount: Number(plain[1]), rest: t.slice(plain[0].length) };

  return null;
}

export function parseIngredientLine(line: string): IngredientLine {
  const raw = line.trim();
  const read = readAmount(raw);
  if (!read) return { amount: null, unit: null, item: raw };

  let rest = read.rest;
  let unit: string | null = null;

  // "120g cottage cheese" — the unit is stuck to the number.
  const tight = rest.match(/^([a-z]+)/i);
  if (tight && TIGHT_UNITS.includes(tight[1].toLowerCase())) {
    unit = tight[1].toLowerCase();
    rest = rest.slice(tight[1].length);
  } else {
    // "2 slices rye bread" — the unit is the next word, if it is a unit at all.
    const word = rest.trimStart().match(/^([a-z]+)\b/i);
    if (word && WORD_UNITS.has(word[1].toLowerCase())) {
      unit = word[1].toLowerCase();
      rest = rest.trimStart().slice(word[1].length);
    }
  }

  // Repeatedly, not once: "1 large fresh tomato" has two words to drop.
  let item = rest.replace(/^[\s,]+/, "");
  while (LEADING_NOISE.test(item)) item = item.replace(LEADING_NOISE, "");
  item = item.trim();
  // "2 eggs" — the food is the only word there, so it is the item, not a unit.
  return { amount: read.amount, unit, item: item || rest.trim() || raw };
}

/** Same thing, however it was capitalised or pluralised in one recipe. */
const key = (item: string, unit: string | null) =>
  `${item.toLowerCase().replace(/[.,;]+$/, "").replace(/s$/, "")}::${unit ?? ""}`;

/**
 * One line per thing to buy, quantities added where they can be.
 *
 * Two lines only combine when the unit matches too: 100g of spinach and a
 * handful of spinach are not five handfuls of anything, so they stay apart and
 * she reads both.
 */
export function aggregateIngredients(lines: string[]): ShoppingItem[] {
  const out = new Map<string, ShoppingItem>();

  for (const line of lines) {
    const parsed = parseIngredientLine(line);
    if (!parsed.item) continue;
    const k = key(parsed.item, parsed.unit);
    const seen = out.get(k);

    if (!seen) {
      out.set(k, { ...parsed, fromMeals: 1 });
      continue;
    }
    seen.fromMeals += 1;
    if (seen.amount !== null && parsed.amount !== null) seen.amount += parsed.amount;
    // A quantified line and an unquantified one of the same thing: keep the
    // number, since "200g yoghurt, plus yoghurt" is just yoghurt.
    else if (parsed.amount !== null) seen.amount = parsed.amount;
  }

  return [...out.values()].sort((a, b) => a.item.localeCompare(b.item));
}

/** Trailing zeros help nobody on a shopping list. */
export const formatAmount = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
