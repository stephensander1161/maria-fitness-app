/**
 * How long she has been training, and what to say when she stops.
 *
 * A session used to be "the calendar day", which is fine until someone
 * trains past midnight — and then the workout she is in the middle of is
 * yesterday's, the screen shows an empty new day, and the coach is told
 * there is no session at all. An explicit start and finish is a session with
 * edges, and the edges are what everything else can then rely on.
 */

/**
 * Milliseconds actually trained. Null when it has not started.
 *
 * Paused time is taken off, and while it *is* paused the clock stops where it
 * was rather than carrying on behind a stopped-looking button. A session left
 * running through a two-hour dinner otherwise reports two hours of training,
 * and "you trained for 2h today" is a number this app either tells the truth
 * about or should not show.
 */
export function elapsedMs(
  startedAt: string | null,
  until: number,
  finishedAt: string | null = null,
  paused: { since: string | null; alreadyMs: number } = { since: null, alreadyMs: 0 },
): number | null {
  if (!startedAt) return null;
  const from = Date.parse(startedAt);
  if (!Number.isFinite(from)) return null;
  const to = finishedAt ? Date.parse(finishedAt) : until;
  const end = Number.isFinite(to) ? to : until;

  // Paused right now: the clock reads what it read when she paused it.
  const since = paused.since ? Date.parse(paused.since) : null;
  const stoppedAt = since !== null && Number.isFinite(since) && !finishedAt ? since : end;

  const banked = Number.isFinite(paused.alreadyMs) ? Math.max(0, paused.alreadyMs) : 0;
  return Math.max(0, stoppedAt - from - banked);
}

/** "1h 24m", "48m", "40s" — the shortest true thing. */
export function readableDuration(ms: number | null): string {
  if (ms === null) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Running clock: "12:04", "1:02:30". */
export function clockDuration(ms: number | null): string {
  if (ms === null) return "0:00";
  const total = Math.floor(ms / 1000);
  const s = String(total % 60).padStart(2, "0");
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
