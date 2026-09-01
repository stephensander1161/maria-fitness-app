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
  /** The measure she named, when unit is "named" — "tbsp", "tin", "glass". */
  namedUnit: string | null;
};

export type PortionUnit =
  | "g" | "kg" | "oz" | "lb" | "ml" | "floz"
  /** One of the food's own natural units — "2 eggs", "1 banana". */
  | "unit"
  /** A named measure: tbsp, tin, glass, handful. See namedUnit and toGrams. */
  | "named";

const GRAMS: Record<Exclude<PortionUnit, "unit" | "named">, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  // Treated as grams: true for water and close enough for milk, stock and
  // juice, which is what people measure this way.
  ml: 1,
  floz: 29.5735,
};

const UNIT_WORDS: Record<string, PortionUnit> = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", millilitre: "ml", milliliter: "ml",
  // A US fluid ounce of anything measured that way — milk, juice, stock.
  floz: "floz",
  // Natural units resolve against the food's own unitGrams: these say "one of
  // whatever this food comes as", so whatever that is, is the right answer.
  x: "unit", piece: "unit", pieces: "unit", item: "unit", items: "unit",
  medium: "unit", large: "unit", small: "unit", whole: "unit",
};

/**
 * Measures that name a specific thing — a spoon, a tin, a glass, a slice.
 *
 * These only resolve when the food itself is measured that way, because they
 * do not transfer: a tablespoon of oil and one of honey differ by half again
 * in weight, and a glass of rice is not a thing. The value is the word to look
 * for in the food's own unitLabel.
 *
 * When the label disagrees, toGrams returns null and the lookup falls through
 * to an estimate — which is the honest outcome, not a failure.
 */
const NAMED_UNITS: Record<string, string> = {
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbsps: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", tsps: "tsp",
  slice: "slice", slices: "slice",
  egg: "egg", eggs: "egg",
  tin: "tin", tins: "tin", can: "tin", cans: "tin",
  glass: "glass", glasses: "glass",
  handful: "handful", handfuls: "handful",
  fillet: "fillet", fillets: "fillet",
  steak: "steak", steaks: "steak",
  pot: "pot", pots: "pot",
  bag: "bag", bags: "bag",
  bar: "bar", bars: "bar",
  portion: "portion", portions: "portion", serving: "portion", servings: "portion",
  scoop: "scoop", scoops: "scoop",
  rasher: "rasher", rashers: "rasher",
  bottle: "bottle", bottles: "bottle",
  bowl: "bowl", bowls: "bowl",
  mug: "mug", mugs: "mug",
  pint: "pint", pints: "pint",
  pack: "pack", packs: "pack", packet: "pack", packets: "pack",
  tub: "tub", tubs: "tub",
  carton: "carton", cartons: "carton",
  pouch: "pouch", pouches: "pouch",
  square: "square", squares: "square",
  jar: "jar", jars: "jar",
  breast: "breast", breasts: "breast",
  thigh: "thigh", thighs: "thigh",
  chop: "chop", chops: "chop",
  sausage: "sausage", sausages: "sausage",
  biscuit: "biscuit", biscuits: "biscuit",
  muffin: "muffin", muffins: "muffin",
  roll: "roll", rolls: "roll",
  bun: "bun", buns: "bun",
  stick: "stick", sticks: "stick",
  ball: "ball", balls: "ball",
  clove: "clove", cloves: "clove",
  wing: "wing", wings: "wing",
  drumstick: "drumstick", drumsticks: "drumstick",
  burger: "burger", burgers: "burger",
  pancake: "pancake", pancakes: "pancake",
  scone: "scone", scones: "scone",
  cracker: "cracker", crackers: "cracker",
  cookie: "cookie", cookies: "cookie",
  nugget: "nugget", nuggets: "nugget",
  wrap: "wrap", wraps: "wrap",
};

/**
 * Words a food's own label may use for the same measure.
 *
 * The library says "can (330ml)" where she says tin, and "portion" where she
 * says serving. Without this, a measure that is genuinely the food's own unit
 * gets refused on a spelling difference and falls through to a model estimate.
 */
const LABEL_SYNONYMS: Record<string, string[]> = {
  tin: ["tin", "can"],
  portion: ["portion", "serving"],
  glass: ["glass", "tumbler"],
  pack: ["pack", "packet"],
  bag: ["bag", "packet"],
  pot: ["pot", "tub"],
  tub: ["tub", "pot"],
  bottle: ["bottle"],
};

/** Words that carry no meaning for the lookup. */
const NOISE = /^(of|a|an|the|some)$/i;

export function parsePortion(input: string): Portion | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  // "100g chicken", "100 g chicken", "2 eggs", "1.5 lb mince", "chicken".
  // "fl oz" is two words for one unit; fold it before the split.
  const match = text.replace(/^([\d.]+)\s*fl\.?\s*oz\b/, "$1floz").match(/^([\d.]+)\s*([a-z]+)?\s*(.*)$/);

  if (!match) {
    return { amount: 100, unit: "g", query: clean(text), assumed: true, namedUnit: null };
  }

  const amount = parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount: 100, unit: "g", query: clean(text), assumed: true, namedUnit: null };
  }

  const word = match[2] ?? "";
  const rest = match[3] ?? "";

  const known = UNIT_WORDS[word];
  if (known) {
    // "2 eggs" — when the measure is also the food, it has to stay searchable.
    const query = clean(rest.trim() ? rest : word);
    return { amount, unit: known, query, assumed: false, namedUnit: null };
  }

  const named = NAMED_UNITS[word];
  if (named) {
    const query = clean(rest.trim() ? rest : word);
    return { amount, unit: "named", query, assumed: false, namedUnit: named };
  }

  // "2 chicken thighs" — a bare number means natural units.
  const query = clean(`${word} ${rest}`);
  return query ? { amount, unit: "unit", query, assumed: false, namedUnit: null } : null;
}

const clean = (s: string) =>
  s.split(/\s+/).filter((w) => w && !NOISE.test(w)).join(" ").trim();

/**
 * How many grams the portion is. Returns null when it depends on a natural unit
 * the food does not define — better to say so than to invent a weight.
 */
export function toGrams(
  portion: Portion,
  unitGrams: number | null,
  unitLabel?: string | null,
): number | null {
  if (portion.unit === "named") {
    // Resolve only when the food itself is measured that way. Otherwise say we
    // cannot, and let the caller estimate rather than publish a confident wrong
    // number for a glass of rice.
    if (unitGrams === null || portion.namedUnit === null) return null;
    const label = unitLabel?.toLowerCase() ?? "";
    const accepted = LABEL_SYNONYMS[portion.namedUnit] ?? [portion.namedUnit];
    return accepted.some((word) => label.includes(word))
      ? portion.amount * unitGrams
      : null;
  }
  if (portion.unit === "unit") {
    return unitGrams === null ? null : portion.amount * unitGrams;
  }
  return portion.amount * GRAMS[portion.unit];
}

/**
 * How well a food's name or one of its aliases answers what she typed.
 * Lower is better; ranking sorts ascending.
 *
 * Aliases have to count. "rice" is an exact alias of "White rice, cooked", and
 * scoring the name alone put it below "Rice cakes", which merely starts with
 * the word — so the staple lost to the snack. An alias match scores half a
 * point behind the equivalent name match: good enough to beat a loose name
 * hit, never enough to outrank the food actually called that.
 */
export function matchScore(query: string, name: string, aliases: string[] = []): number {
  const q = query.trim().toLowerCase();
  const rank = (s: string) => {
    const v = s.trim().toLowerCase();
    return v === q ? 0 : v.startsWith(q) ? 1 : v.includes(q) ? 2 : 3;
  };
  const byName = rank(name);
  const byAlias = aliases.length ? Math.min(...aliases.map(rank)) + 0.5 : Infinity;
  return Math.min(byName, byAlias);
}
