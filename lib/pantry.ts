/**
 * What is in her kitchen, and whether it covers what she has planned to cook.
 *
 * The whole feature turns on one distinction, which is the same one this app
 * gets wrong most often when it gets anything wrong:
 *
 *   • a row with an amount        — she has this much
 *   • a row with a null amount    — she has some, we do not know how much
 *   • a row with amount 0         — she is out
 *   • no row at all               — never bought, nothing known
 *
 * Only the third of those means "buy it". Collapsing the second into either of
 * the others is how a kitchen list stops being believed: told to buy rice she
 * has a full bag of, she stops reading it; told she has chicken she ran out of
 * on Tuesday, she plans a dinner she cannot cook.
 *
 * Amounts are kept in the units the recipe wrote them in — grams, tablespoons,
 * cans — and only ever compared like with like, for the same reason the
 * shopping list does not convert: 100g of spinach and a handful of spinach are
 * not five handfuls of anything.
 */

import {
  formatAmount, normaliseItem, parseIngredientLine, type IngredientLine,
} from "@/lib/shopping";

// One grammar for the name of a thing, shared with the shopping list: a recipe
// line, a list line and a kitchen row must all fold to the same string, or the
// kitchen holds "tomatoes" while the list asks for "tomato".
export { normaliseItem };

/** The database stores "" for "no unit"; the domain uses null. */
export const unitIn = (unit: string | null | undefined): string => (unit ?? "").trim().toLowerCase();
export const unitOut = (unit: string): string | null => (unit === "" ? null : unit);

export type Stock = {
  item: string;
  /** Null is "some, amount unknown" — never treat it as zero. */
  amount: number | null;
  unit: string | null;
};

export type Need = { item: string; amount: number | null; unit: string | null; fromMeals: number };

export type StockStatus =
  /** Enough on hand for everything still planned. */
  | "have"
  /** On hand, but not enough — `shortBy` says how much. */
  | "short"
  /** Known to be out. */
  | "out"
  /** On hand in an amount nobody has recorded, or needed in one. */
  | "unknown"
  /** Not in the kitchen at all. */
  | "missing";

export type StockLine = Need & {
  have: number | null;
  status: StockStatus;
  /** How much more is needed, when both sides are known and comparable. */
  shortBy: number | null;
};

const key = (item: string, unit: string | null) => `${normaliseItem(item)}::${unit ?? ""}`;

/**
 * Match what is planned against what is in the kitchen.
 *
 * A need and a stock line only meet when the unit matches as well as the name.
 * A mismatch is reported as `unknown`, not as missing: "2 cans of tomatoes"
 * against "400g tomatoes" is a question for her, not a number for us.
 */
export function compareStock(needs: Need[], stock: Stock[]): StockLine[] {
  const byKey = new Map(stock.map((s) => [key(s.item, s.unit), s]));
  const byName = new Map<string, Stock[]>();
  for (const s of stock) {
    const n = normaliseItem(s.item);
    byName.set(n, [...(byName.get(n) ?? []), s]);
  }

  return needs.map((need) => {
    const exact = byKey.get(key(need.item, need.unit));
    const sameName = byName.get(normaliseItem(need.item)) ?? [];

    if (!exact && sameName.length === 0) {
      return { ...need, have: null, status: "missing" as const, shortBy: null };
    }
    // Named, but measured differently from the recipe line.
    if (!exact) {
      return { ...need, have: null, status: "unknown" as const, shortBy: null };
    }
    if (exact.amount === 0) {
      return { ...need, have: 0, status: "out" as const, shortBy: need.amount };
    }
    // Either side unknown means the comparison is unknown. This is the case
    // that must not quietly become "have" — or "buy".
    if (exact.amount === null || need.amount === null) {
      return { ...need, have: exact.amount, status: "unknown" as const, shortBy: null };
    }
    if (exact.amount >= need.amount) {
      return { ...need, have: exact.amount, status: "have" as const, shortBy: null };
    }
    return {
      ...need, have: exact.amount, status: "short" as const,
      shortBy: Math.round((need.amount - exact.amount) * 100) / 100,
    };
  });
}

/**
 * Take a cooked meal's ingredients out of the kitchen.
 *
 * Returns the new amount for each line it touched, and says which ones it could
 * only mark as "used, amount unknown". Subtracting an unrecorded amount from a
 * known stock does not leave the old number — she used some of it, so the
 * number is no longer true — and it does not leave zero either. It leaves
 * null, which is exactly what we now know.
 */
export function applyConsumption(
  stock: Stock[],
  lines: string[],
): { item: string; unit: string | null; amount: number | null; wasKnown: boolean }[] {
  const byKey = new Map(stock.map((s) => [key(s.item, s.unit), s]));
  const out = new Map<string, { item: string; unit: string | null; amount: number | null; wasKnown: boolean }>();

  // One row per name, for lines that do not name the same measure the kitchen
  // holds — "olive oil" against 500ml of it. Only when it is unambiguous.
  const byName = new Map<string, Stock[]>();
  for (const s of stock) {
    const n = normaliseItem(s.item);
    byName.set(n, [...(byName.get(n) ?? []), s]);
  }

  for (const line of lines) {
    const parsed: IngredientLine = parseIngredientLine(line);
    if (!parsed.item) continue;

    const exactKey = key(parsed.item, parsed.unit);
    const sameName = byName.get(normaliseItem(parsed.item)) ?? [];
    const matched = byKey.get(exactKey) ?? (sameName.length === 1 ? sameName[0] : undefined);
    // Nothing in the kitchen to take from, or two rows and no way to tell
    // which she cooked with: not an error, and emphatically not a reason to
    // create a row at zero. She may simply never have logged it.
    if (!matched) continue;

    const k = key(matched.item, matched.unit);
    const held = out.get(k);
    const before = held ? held.amount : matched.amount;
    const wasKnown = before !== null;
    // Comparable only when the recipe measured it the way the kitchen did.
    const comparable = unitIn(matched.unit) === unitIn(parsed.unit);
    const amount =
      before === null || parsed.amount === null || !comparable
        ? null
        : Math.max(0, Math.round((before - parsed.amount) * 100) / 100);

    out.set(k, { item: normaliseItem(matched.item), unit: matched.unit, amount, wasKnown });
  }

  return [...out.values()];
}

/** Add bought groceries to what is already there. */
export function applyRestock(
  stock: Stock[],
  bought: { item: string; amount: number | null; unit: string | null }[],
): { item: string; unit: string | null; amount: number | null }[] {
  const byKey = new Map(stock.map((s) => [key(s.item, s.unit), s]));
  const out = new Map<string, { item: string; unit: string | null; amount: number | null }>();

  const byName = new Map<string, Stock[]>();
  for (const s of stock) {
    const n = normaliseItem(s.item);
    byName.set(n, [...(byName.get(n) ?? []), s]);
  }

  for (const b of bought) {
    const item = normaliseItem(b.item);
    if (!item) continue;

    // A bought line with no measure ("olive oil") tops up the one row of that
    // name if there is exactly one. A line with a *different* measure gets its
    // own row, the way the shopping list keeps a weight and a tin apart.
    const sameName = byName.get(item) ?? [];
    const fallback = b.unit === null && sameName.length === 1 ? sameName[0] : undefined;
    const target = byKey.get(key(item, b.unit)) ?? fallback;
    const unit = target ? target.unit : b.unit;

    const k = key(item, unit);
    const held = out.get(k) ?? target;
    const before = held?.amount ?? null;

    // An unknown amount on either side keeps the total unknown — "some rice
    // plus a bag of rice" is still an amount nobody has counted.
    const amount =
      b.amount === null ? null
        : held === undefined ? b.amount
          : before === null || unitIn(unit) !== unitIn(b.unit) ? null
            : Math.round((before + b.amount) * 100) / 100;

    out.set(k, { item, unit, amount });
  }

  return [...out.values()];
}

/** "400g", "2 cans", or "some" when nobody has counted it. */
export function stockLabel(amount: number | null, unit: string | null): string {
  if (amount === null) return "some";
  if (amount === 0) return "out";
  const n = formatAmount(amount);
  if (!unit) return n;
  // Tight units read as one word — 400g — the way a recipe writes them.
  return /^(g|kg|ml|l|oz|lb)$/.test(unit) ? `${n}${unit}` : `${n} ${unit}`;
}

/**
 * A summary that says what it does not know.
 *
 * `unknownFor` is not decoration: a kitchen where half the amounts are
 * uncounted cannot honestly be summarised as "you need four things".
 */
export function summariseStock(lines: StockLine[]) {
  return {
    need: lines.filter((l) => l.status === "missing" || l.status === "out" || l.status === "short").length,
    have: lines.filter((l) => l.status === "have").length,
    unknownFor: lines.filter((l) => l.status === "unknown").length,
  };
}
