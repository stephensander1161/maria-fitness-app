/**
 * How much of today's coach allowance is left, as a whole percentage.
 *
 * Its own module, and a pure one, on purpose: it is imported by a "use client"
 * component, and the first version lived in lib/limits.ts — which imports the
 * database. That pulled postgres into the browser bundle and broke every page
 * with "Can't resolve 'fs'". A client component may import only modules that
 * import nothing server-side, and tests/invariants.test.ts now says so.
 */
export function allowanceLeftPct(costMicros: number, limitMicros: number): number {
  if (limitMicros <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - costMicros / limitMicros))));
}

/** Below this, the thread says so. A quarter: enough to finish the thought. */
export const ALLOWANCE_WARN_PCT = 25;
