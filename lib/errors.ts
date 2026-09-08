import { desc, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { appErrors } from "@/lib/db/schema";
import type { Signal } from "@/lib/security-signals";

/**
 * The app's own errors, recorded and read back.
 *
 * `shapeError` is pure and is the whole privacy boundary: whatever Next hands
 * the hook — and it hands the request headers, cookie included — only these
 * fields reach the table. tests/errors.test.ts feeds it a session cookie and
 * a bearer token and checks neither can be found anywhere in the row.
 */

export const APP_ERROR_RETENTION_DAYS = 30;

/**
 * Errors that only mean the person navigated away.
 *
 * Six "destination stream closed early" from one afternoon of probing were
 * already in the log, and a card full of those is a card nobody reads — the
 * same crying-wolf problem lib/security-signals.ts is written around. These
 * are not recorded, and the card says so rather than letting a filtered log
 * look like a quiet one.
 *
 * Deliberately a tight list matched on the whole phrase: a substring like
 * "aborted" would also swallow a genuine abort inside a tool.
 */
const CLIENT_GONE = [
  "The destination stream closed early",
  "The user aborted a request",
  "aborted a request",
  "ResponseAborted",
];

export const isClientGone = (message: string): boolean =>
  CLIENT_GONE.some((phrase) => message.includes(phrase));
const MESSAGE_MAX = 500;
const STACK_MAX = 4000;

export type ErrorRow = {
  route: string;
  method: string;
  kind: string;
  message: string;
  stack: string | null;
};

export function shapeError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
): ErrorRow {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : null;
  return {
    // The pattern where Next knows it, the path otherwise — and the path is
    // still only a path: no query string reaches here.
    route: context.routePath || request.path.split("?")[0],
    method: request.method,
    kind: context.routeType,
    message: message.slice(0, MESSAGE_MAX),
    stack: stack ? stack.slice(0, STACK_MAX) : null,
  };
}

/** Insert, and let the table forget what is older than the window. */
export async function recordError(row: ErrorRow, now = new Date()): Promise<void> {
  if (isClientGone(row.message)) return;
  await db.insert(appErrors).values(row);
  const cutoff = new Date(now.getTime() - APP_ERROR_RETENTION_DAYS * 86_400_000);
  await db.delete(appErrors).where(lt(appErrors.at, cutoff));
}

export type ErrorGroup = {
  route: string;
  method: string;
  kind: string;
  message: string;
  count: number;
  lastAt: Date;
};

/** Last week's errors, one line per distinct route + message, most recent first. */
export function groupErrors(rows: { route: string; method: string; kind: string; message: string; at: Date }[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const r of rows) {
    const key = `${r.method} ${r.route} ${r.message}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      if (r.at > g.lastAt) g.lastAt = r.at;
    } else {
      groups.set(key, { route: r.route, method: r.method, kind: r.kind, message: r.message, count: 1, lastAt: r.at });
    }
  }
  return [...groups.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export async function recentErrors(days = 7): Promise<ErrorGroup[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.select({
    route: appErrors.route, method: appErrors.method, kind: appErrors.kind, message: appErrors.message, at: appErrors.at,
  }).from(appErrors).where(gte(appErrors.at, since)).orderBy(desc(appErrors.at)).limit(1000);
  return groupErrors(rows);
}

/**
 * What "worth a look" should say about errors: one line for the last day,
 * ranked watch rather than alert, because one error is usually one person's
 * one bad request and the console must not cry wolf. Silence when there are
 * none — the card states absence separately.
 */
export function errorSignals(groups: ErrorGroup[], now: Date): Signal[] {
  const dayAgo = now.getTime() - 86_400_000;
  const recent = groups.filter((g) => g.lastAt.getTime() >= dayAgo);
  if (recent.length === 0) return [];
  const count = recent.reduce((n, g) => n + g.count, 0);
  const routes = [...new Set(recent.map((g) => g.route))];
  return [{
    kind: "errors",
    level: "watch",
    title: `${count} server error${count === 1 ? "" : "s"} in the last 24 hours`,
    detail:
      `On ${routes.slice(0, 3).join(", ")}${routes.length > 3 ? ` and ${routes.length - 3} more` : ""}. ` +
      "The errors card below has the messages. One is usually one person's one bad request; the same one repeating is a bug.",
    count,
    lastAt: recent[0].lastAt,
    ip: null,
  }];
}

/**
 * Whether the nightly copy is happening. Read from the audit log, because
 * that is where the cron writes; a job that has stopped is the failure mode
 * this exists to catch, so silence is a signal here and not an absence.
 */
export function backupSignal(
  events: { at: Date; event: string; detail: Record<string, unknown> | null }[],
  now: Date,
): Signal[] {
  const taken = events.filter((e) => e.event === "backup.taken").sort((a, b) => b.at.getTime() - a.at.getTime());
  const failed = events.filter((e) => e.event === "backup.failed").sort((a, b) => b.at.getTime() - a.at.getTime());
  const last = taken[0];
  const lastFailure = failed[0];
  const stale = !last || now.getTime() - last.at.getTime() > 36 * 3_600_000;

  if (lastFailure && (!last || lastFailure.at > last.at)) {
    const reason = typeof lastFailure.detail?.reason === "string" ? lastFailure.detail.reason : "no reason recorded";
    return [{
      kind: "backup",
      level: "alert",
      title: "The nightly backup is failing",
      detail: `Last attempt: ${reason}. ${last ? `The last good copy was taken ${describeAge(now, last.at)}.` : "There is no stored copy at all."}`,
      count: failed.length,
      lastAt: lastFailure.at,
      ip: null,
    }];
  }
  if (stale) {
    return [{
      kind: "backup",
      level: last ? "watch" : "note",
      title: last ? `No backup for ${describeAge(now, last.at)}` : "The nightly backup has not run yet",
      detail: last
        ? "It runs at 09:00 UTC. If this persists, check the cron in the Vercel project and that CRON_SECRET is set."
        : "It runs at 09:00 UTC once the project has CRON_SECRET and a blob store. Until then the only copies are the ones taken by hand.",
      count: 1,
      lastAt: last?.at ?? now,
      ip: null,
    }];
  }
  return [];
}

function describeAge(now: Date, then: Date): string {
  const hours = Math.round((now.getTime() - then.getTime()) / 3_600_000);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}
