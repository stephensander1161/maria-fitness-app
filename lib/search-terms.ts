/**
 * The words she uses versus the names the library has.
 *
 * "pull up", "pull-up", "pullup" and "pull ups" are one search. So are
 * "squats" and "squat", "press ups" and "push-up". A substring match on the
 * stored name misses most of these, and tagging every spelling by hand across
 * a couple of hundred movements is the kind of coverage that is uneven the
 * day it ships. So the query is turned into the handful of spellings it could
 * be, and each is tried.
 *
 * Pure, and shared: the picker filters in the browser with `matchesQuery`, and
 * the coach's search tool builds one ILIKE per variant from `queryVariants`.
 */

/** Lower-case, separators to single spaces, trailing plural dropped per word. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 2 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

/** A few names that differ by dialect rather than spelling. */
const SYNONYMS: Record<string, string> = {
  "press up": "push up",
  "pressup": "push up",
  "chin": "chin up",
  "hip thrust": "hip thrust",
  "dead lift": "deadlift",
  "sit up": "sit up",
  "rdl": "romanian deadlift",
  "ohp": "overhead press",
};

/** Every spelling worth trying for what she typed, most specific first. */
export function queryVariants(raw: string): string[] {
  const n = normalise(raw);
  if (!n) return [];
  const base = SYNONYMS[n] ?? n;
  const out = new Set<string>([base]);
  out.add(base.replace(/ /g, "-"));   // "pull up"  → "pull-up"
  out.add(base.replace(/ /g, ""));    // "pull up"  → "pullup"
  if (base !== n) { out.add(n); out.add(n.replace(/ /g, "-")); out.add(n.replace(/ /g, "")); }
  return [...out];
}

/** Does this movement answer to what she typed? */
export function matchesQuery(
  raw: string,
  item: { name: string; muscles?: string[]; tags?: string[] },
): boolean {
  const variants = queryVariants(raw);
  if (variants.length === 0) return false;
  const haystack = [item.name, ...(item.muscles ?? []), ...(item.tags ?? [])]
    .map(normalise)
    // Compare with separators removed too, so "pullup" finds "pull up".
    .flatMap((h) => [h, h.replace(/ /g, "")]);
  return variants.some((v) => haystack.some((h) => h.includes(v)));
}
