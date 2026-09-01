/**
 * Turning "100g boiled egg" or "2 eggs" into a quantity and a search term.
 *
 * Kept pure and separate from the lookup so the parsing can be tested without a
 * database — this is the part that quietly gets it wrong, and a mis-parsed
 * portion is a wrong calorie number presented with total confidence.
 */

export type Portion = {
  /** Amount in the unit she typed. */
  amount: number;
  unit: PortionUnit;
  /** What to look up. */
  query: string;
  /** True when no amount was given and 100g was assumed. */
  assumed: boolean;
};

export type PortionUnit = "g" | "kg" | "oz" | "lb" | "ml" | "unit";

const GRAMS: Record<Exclude<PortionUnit, "unit">, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  // Treated as grams: true for water and close enough for milk, stock and
  // juice, which is what people measure this way.
  ml: 1,
};

const UNIT_WORDS: Record<string, PortionUnit> = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", millilitre: "ml", milliliter: "ml",
  // Natural units resolve against the food's own unitGrams.
  x: "unit", piece: "unit", pieces: "unit", slice: "unit", slices: "unit",
  egg: "unit", eggs: "unit", item: "unit", items: "unit",
  medium: "unit", large: "unit", small: "unit", whole: "unit",
};

/** Words that carry no meaning for the lookup. */
const NOISE = /^(of|a|an|the|some)$/i;

export function parsePortion(input: string): Portion | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  // "100g chicken", "100 g chicken", "2 eggs", "1.5 lb mince", "chicken"
  const match = text.match(/^([\d.]+)\s*([a-z]+)?\s*(.*)$/);

  if (!match) {
    return { amount: 100, unit: "g", query: clean(text), assumed: true };
  }

  const amount = parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount: 100, unit: "g", query: clean(text), assumed: true };
  }

  const word = match[2] ?? "";
  const rest = match[3] ?? "";

  // "2 eggs" — the unit word is also the food, so keep it in the query.
  const known = UNIT_WORDS[word];
  if (known && rest.trim()) {
    return { amount, unit: known, query: clean(rest), assumed: false };
  }
  if (known && !rest.trim()) {
    return { amount, unit: known, query: clean(word), assumed: false };
  }

  // "2 chicken thighs" — a bare number means natural units.
  const query = clean(`${word} ${rest}`);
  return query ? { amount, unit: "unit", query, assumed: false } : null;
}

const clean = (s: string) =>
  s.split(/\s+/).filter((w) => w && !NOISE.test(w)).join(" ").trim();

/**
 * How many grams the portion is. Returns null when it depends on a natural unit
 * the food does not define — better to say so than to invent a weight.
 */
export function toGrams(portion: Portion, unitGrams: number | null): number | null {
  if (portion.unit === "unit") {
    return unitGrams === null ? null : portion.amount * unitGrams;
  }
  return portion.amount * GRAMS[portion.unit];
}
