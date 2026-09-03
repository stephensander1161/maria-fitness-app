import { LIBRARY_GROUP_ORDER, type LibraryGroup } from "@/lib/muscle-groups";

/**
 * How long she rests, and who decides.
 *
 * Three sources, most specific first: what she set for this muscle group,
 * what she set for everything, and what the plan wrote for this movement.
 * The plan's number is a reasonable default rather than a preference —
 * someone training in a lunch hour wants sixty seconds on everything, and
 * someone squatting heavy wants three minutes on that and ninety on the rest.
 *
 * Kept pure and here rather than inline in the view, because it is the sort
 * of precedence that goes subtly wrong once it exists in two places.
 */
export type RestPreferences = {
  defaultRestSeconds: number | null;
  restByGroup: Record<string, number> | null;
};

/** Nobody rests for four seconds, and nobody rests for an hour. */
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;

export function restSecondsFor(
  prefs: RestPreferences,
  group: LibraryGroup | null,
  planned: number,
): number {
  const forGroup = group ? prefs.restByGroup?.[group] : undefined;
  const chosen = forGroup ?? prefs.defaultRestSeconds ?? planned;
  // A stored zero would mean "no rest at all", which no interface here can
  // set and which would silently disable the timer.
  if (!Number.isFinite(chosen) || chosen <= 0) return planned;
  return Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, Math.round(chosen)));
}

/** The groups worth offering a separate number for, in the library's order. */
export const REST_GROUPS: LibraryGroup[] = LIBRARY_GROUP_ORDER;
