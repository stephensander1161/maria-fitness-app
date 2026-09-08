/**
 * How fast the marker on the current movement beats.
 *
 * It is a heart rate, and it behaves like one: quick the moment a set is
 * finished, settling as the rest runs down and the next set comes up. That is
 * the right way round — the pulse is *recovery*, not a countdown getting
 * urgent — and it means the card is telling her something true about where
 * she is in the rest without her reading a clock.
 *
 * Pure, so the ends are checked: a rest that has just started, one that has
 * run out, and no rest at all.
 */
export const BEAT_FAST_S = 0.55;
export const BEAT_CALM_S = 1.9;

/**
 * `remainingMs` of `totalMs`. With no rest running — she is between
 * movements, or has just opened the app — it sits at the calm end.
 */
export function beatSeconds(remainingMs: number | null, totalMs: number | null): number {
  if (remainingMs === null || totalMs === null) return BEAT_CALM_S;
  if (!Number.isFinite(remainingMs) || !Number.isFinite(totalMs) || totalMs <= 0) return BEAT_CALM_S;
  const left = Math.max(0, Math.min(1, remainingMs / totalMs));
  // Linear from calm (no rest left) to fast (the whole rest ahead).
  const seconds = BEAT_CALM_S - left * (BEAT_CALM_S - BEAT_FAST_S);
  return Math.round(seconds * 100) / 100;
}
