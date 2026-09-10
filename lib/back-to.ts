/**
 * Where "back" goes from a movement's page.
 *
 * It was hardcoded to the library, because that is the only place the page
 * used to be reached from. It is now reached from the day's warm-up and
 * cool-down, from the plan, and from the library — and landing in the library
 * after tapping a stretch on the Train screen is the app losing her place.
 *
 * The caller passes where it came from, which means this is a value from the
 * URL deciding where a link points, so it is validated rather than trusted:
 *
 * - Its first segment must be a screen this app actually has. An allowlist,
 *   not a pattern, so a new route is a deliberate addition here. **This is the
 *   check that does the work** — "//evil.example" has an empty first segment
 *   and is refused by it, which a mutation test confirmed.
 * - It must also start with a single "/". Belt and braces on top of the
 *   allowlist rather than the thing holding this up, and kept for the day
 *   somebody widens the list.
 * - Anything else falls back to the library, which is always a safe answer.
 *
 * No user data travels in it and nothing is written from it — the whole job is
 * a label and an href — but a redirect target read out of a query string is
 * exactly the shape that becomes a phishing link the moment somebody stops
 * checking it.
 */
const RETURNABLE: Record<string, string> = {
  train: "Today",
  plan: "Plan",
  progress: "Progress",
  eat: "Eat",
  learn: "Library",
  recovery: "Recovery",
};

export const LIBRARY = { href: "/learn", label: "Library" };

export function backTo(from: string | null | undefined): { href: string; label: string } {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return LIBRARY;
  // No fragment, no whitespace, no control characters, and a sane length.
  if (from.length > 200 || /[\s#\\]/.test(from)) return LIBRARY;

  const [path, query] = from.split("?", 2);
  const first = path.split("/")[1] ?? "";
  const label = RETURNABLE[first];
  if (!label) return LIBRARY;
  // Rebuilt from the parts that passed, never echoed back whole.
  const safeQuery = query !== undefined && /^[A-Za-z0-9_=&%.-]{0,120}$/.test(query) ? `?${query}` : "";
  return { href: `/${first}${safeQuery}`, label };
}

/**
 * A link into a movement's page that comes back here.
 *
 * A helper rather than a prop threaded through three components: every caller
 * wants the same thing, and one that forgets sends her to the library instead
 * of back to where she was — which is the bug this exists to fix.
 */
export const movementHref = (slug: string, from: string): string =>
  `/learn/${slug}?from=${encodeURIComponent(from)}`;
