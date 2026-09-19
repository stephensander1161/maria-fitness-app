import { choice, noul } from "@typesafe-ai/sdk";
import { decide } from "@/lib/jev";

/**
 * Recipe lines, made shoppable — decided where a rule cannot be written.
 *
 * Meal templates were written by people, for people: "lettuce, tomato, red
 * onion" is one line of a salad and three things to buy; "salt and pepper"
 * is one line and two; "sweet and sour sauce" is one line and one thing.
 * No split rule survives all three, so it is asked as a question per line
 * — is this more than one grocery item? — and only a confident yes splits.
 * Aisles the same way: the library's labels place most things, and what
 * they cannot place is asked, rather than filed under Other.
 *
 * Both are batched into one call per list and cached per line, so a week
 * of meals costs one round trip the first time and nothing after.
 */
const AISLES = ["Fruit & veg", "Meat & fish", "Dairy & eggs", "Chilled & frozen", "Cupboard", "Snacks", "Drinks"] as const;
export type Aisle = (typeof AISLES)[number] | "Other";

export const SPLIT_CONFIDENCE = 0.7;
export const AISLE_CONFIDENCE = 0.6;

const splits = new Map<string, boolean>();
const aisles = new Map<string, Aisle>();

/** "2 cups lettuce, tomato, red onion" → the first keeps its amount, the rest are plain. */
export function splitCompound(line: string): string[] {
  const parts = line.split(/\s*,\s*|\s+and\s+|\s*&\s*/i).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [line];
}

/** Lines with a confident "more than one item" verdict, split; the rest as they were. */
export async function splitLines(lines: string[]): Promise<string[]> {
  const unknown = [...new Set(lines)].filter((l) => !splits.has(l) && splitCompound(l).length > 1);
  if (unknown.length > 0) {
    const questions = Object.fromEntries(unknown.map((l, i) => [`q${i}`, noul(
      "This recipe line names more than one distinct grocery item to buy — like 'lettuce, tomato, red onion' — rather than one item whose name contains a comma or 'and', like 'sweet and sour sauce' or 'salt and pepper' when sold together.",
    )]));
    const result = await decide({ lines: Object.fromEntries(unknown.map((l, i) => [`q${i}`, l])) }, questions);
    unknown.forEach((l, i) => splits.set(l, result ? result.answers[`q${i}`].noul >= SPLIT_CONFIDENCE : false));
  }
  return lines.flatMap((l) => (splits.get(l) ? splitCompound(l) : [l]));
}

/** Aisles for items the library could not place. Unknown stays Other. */
export async function aislesFor(items: string[]): Promise<Map<string, Aisle>> {
  const out = new Map<string, Aisle>();
  const unknown = [...new Set(items)].filter((i) => !aisles.has(i));
  if (unknown.length > 0) {
    const criteria = Object.fromEntries(AISLES.map((a) => [a, a]));
    const questions = Object.fromEntries(unknown.map((it, i) => [`q${i}`, choice("Which supermarket aisle is this grocery item found in?", criteria)]));
    const result = await decide({ items: Object.fromEntries(unknown.map((it, i) => [`q${i}`, it])) }, questions);
    unknown.forEach((it, i) => {
      const a = result?.answers[`q${i}`];
      aisles.set(it, a && a.confidence >= AISLE_CONFIDENCE ? (a.choice as Aisle) : "Other");
    });
  }
  for (const it of items) out.set(it, aisles.get(it) ?? "Other");
  return out;
}
