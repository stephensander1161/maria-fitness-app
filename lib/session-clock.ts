/**
 * How long she has been training, and what to say when she stops.
 *
 * A session used to be "the calendar day", which is fine until someone
 * trains past midnight — and then the workout she is in the middle of is
 * yesterday's, the screen shows an empty new day, and the coach is told
 * there is no session at all. An explicit start and finish is a session with
 * edges, and the edges are what everything else can then rely on.
 */

/** Milliseconds, from two ISO strings. Null when it has not started. */
export function elapsedMs(startedAt: string | null, until: number, finishedAt: string | null = null): number | null {
  if (!startedAt) return null;
  const from = Date.parse(startedAt);
  if (!Number.isFinite(from)) return null;
  const to = finishedAt ? Date.parse(finishedAt) : until;
  return Math.max(0, (Number.isFinite(to) ? to : until) - from);
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

/**
 * What to say when she finishes.
 *
 * Twenty of them, chosen by the session rather than at random on every
 * render, so the sentence does not change while she is reading it. They are
 * about the work, never about her body, and none of them is a joke at her
 * expense on a day she only managed two sets.
 */
export const DONE_LINES = [
  "That's the work done.",
  "Session logged. That's another one in the bank.",
  "Done. The hard part was starting.",
  "That's it — everything you planned, finished.",
  "Booked. Your future self says thanks.",
  "Strong work. Go and eat something.",
  "That's the whole session. Nice.",
  "Finished. Consistency is the whole trick.",
  "Done and dusted.",
  "That's a session you'll be glad you did.",
  "All of it, done. Good.",
  "Logged. Rest is where it actually happens.",
  "That's the one. Same again next time.",
  "Session complete. Nothing skipped.",
  "Work's done. Recovery starts now.",
  "That's another brick in the wall.",
  "Finished strong.",
  "Done. Turning up is most of it, and you turned up.",
  "That's the session — all yours.",
  "Complete. Go and enjoy the rest of your day.",
] as const;

/** Stable for a given session: the same line for the whole time it is shown. */
export function doneLine(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return DONE_LINES[Math.abs(hash) % DONE_LINES.length];
}
