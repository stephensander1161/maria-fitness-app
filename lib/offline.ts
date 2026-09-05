"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ActionError, action } from "@/lib/client";
import { today, type ISODate } from "@/lib/date";

/**
 * A deliberately tiny outbox for one tool: `log_set`.
 *
 * Gym wifi drops constantly, and a lost set is the one failure she actually
 * notices. So a set that fails for a *network* reason is parked in
 * localStorage and replayed in order when the signal comes back. Everything
 * still goes through `action()` and the tool registry — this only decides
 * *when* the call is made, never what it does.
 *
 * It is not a sync layer. Nothing else is queued, nothing is merged, and a
 * real rejection (4xx) is never retried.
 */

const KEY = "coach.pending-sets.v1";
/** A claim older than this belonged to a tab that died mid-flush. */
const CLAIM_TTL_MS = 30_000;

export type PendingSetInput = {
  exerciseSlug: string;
  /** Omitted for a hold, where the seconds are what moved. */
  reps?: number;
  /** Seconds, for a movement that is held rather than counted. */
  holdSeconds?: number;
  weight: number | null;
  /** How many she had left. Omitted when she did not say — never sent as 0. */
  rir?: number;
  /** Pinned when she performed the set — a set queued at 11pm must not flush
   *  onto tomorrow's workout. */
  date: ISODate;
  /** Minted once, replayed on every retry, so a lost response cannot double-log. */
  clientKey: string;
};

export type PendingSet = {
  id: string;
  input: PendingSetInput;
  queuedAt: number;
  /** Stamped while a flush holds this row, so a second flush cannot send it
   *  again. This is what makes a double-flush safe. */
  claimedAt?: number;
};

const EMPTY: PendingSet[] = [];

let cache: PendingSet[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function readStorage(): PendingSet[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter(
      (p): p is PendingSet =>
        !!p && typeof p === "object" &&
        typeof (p as PendingSet).id === "string" &&
        !!(p as PendingSet).input &&
        typeof (p as PendingSet).input.exerciseSlug === "string",
    );
  } catch {
    // Private browsing, quota, or corrupted JSON. Losing the queue is bad but
    // crashing the log button is worse.
    return EMPTY;
  }
}

function write(next: PendingSet[]) {
  cache = next.length === 0 ? EMPTY : next;
  try {
    if (next.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* keep the in-memory copy; it survives at least this page view */
  }
  emit();
}

/** Current queue. Stable identity between writes, so it is safe as a snapshot. */
export function pendingSets(): PendingSet[] {
  if (typeof window === "undefined") return EMPTY;
  if (!hydrated) {
    cache = readStorage();
    hydrated = true;
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    cache = readStorage();
    hydrated = true;
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Sets waiting to reach the server. Renders as [] during SSR/hydration. */
export function usePendingSets(): PendingSet[] {
  return useSyncExternalStore(subscribe, pendingSets, () => EMPTY);
}

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function enqueue(input: PendingSetInput) {
  write([...pendingSets(), { id: newId(), input, queuedAt: Date.now() }]);
}

function drop(id: string) {
  write(pendingSets().filter((p) => p.id !== id));
}

function setClaim(id: string, claimedAt: number | undefined) {
  write(pendingSets().map((p) => (p.id === id ? { ...p, claimedAt } : p)));
}

const isClaimed = (p: PendingSet) =>
  p.claimedAt !== undefined && Date.now() - p.claimedAt < CLAIM_TTL_MS;

export type LogSetOutcome<T> =
  | { queued: false; result: T }
  | { queued: true; result: null };

/**
 * Log a set, or park it if the network is the thing that failed.
 *
 * The date is pinned here rather than at flush time, and the queue is drained
 * strictly in order, so a burst of offline sets replays exactly as performed.
 */
export async function logSetOrQueue<T>(input: PendingSetInput): Promise<LogSetOutcome<T>> {
  try {
    const result = await action<T>("log_set", { ...input });
    return { queued: false, result };
  } catch (err) {
    if (err instanceof ActionError && err.retriable) {
      enqueue(input);
      return { queued: true, result: null };
    }
    throw err;
  }
}

/**
 * The zone the phone is in.
 *
 * This module runs in the browser, where `process.env.APP_TIMEZONE` is not
 * inlined — it has no NEXT_PUBLIC_ prefix — so a bare `today()` here silently
 * fell back to UTC. Every set logged after about 5pm Mountain was dated
 * tomorrow, offline or not: exactly the bug lib/date.ts was written to
 * prevent, reintroduced on the client side of the same feature.
 */
export const deviceZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/**
 * Build the input for a set she performed.
 *
 * The date is pinned here rather than left to the server, so a set queued at
 * 11pm cannot flush onto tomorrow's workout — and so that a card open on
 * yesterday files its correction against yesterday. Defaults to her device's
 * today, which is the case that matters.
 */
export const setInput = (
  exerciseSlug: string,
  /** Reps for a counted movement, or `{ holdSeconds }` for a hold. */
  done: number | { holdSeconds: number },
  weight: number | null,
  /** Reps in reserve. Undefined means she did not say, which is not zero. */
  rir?: number | null,
  date?: ISODate,
): PendingSetInput => ({
  exerciseSlug,
  ...(typeof done === "number" ? { reps: done } : { holdSeconds: done.holdSeconds }),
  weight,
  ...(rir === undefined || rir === null ? {} : { rir }),
  date: date ?? today(deviceZone()),
  clientKey: crypto.randomUUID(),
});

export type FlushResult = { flushed: number; dropped: number; remaining: number };

let inFlight: Promise<FlushResult> | null = null;

/**
 * Drain the outbox. Concurrent callers share one pass — the whole point is
 * that "online" firing while a retry is already running cannot double-log.
 */
export function flushPendingSets(): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = drain().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function drain(): Promise<FlushResult> {
  let flushed = 0;
  let dropped = 0;

  for (;;) {
    // Re-read every pass: storage, not a local copy, is the source of truth.
    const next = pendingSets()[0];
    if (!next) break;
    // Head of the queue is already in flight elsewhere (another tab). Stop
    // rather than skip past it — order matters more than throughput here.
    if (isClaimed(next)) break;

    setClaim(next.id, Date.now());
    try {
      await action("log_set", { ...next.input });
      drop(next.id);
      flushed++;
    } catch (err) {
      const status = err instanceof ActionError ? err.status : null;
      if (status === null || status >= 500) {
        // Still no signal, or the server is unwell. Keep it, keep the order.
        setClaim(next.id, undefined);
        break;
      }
      if (status === 401 || status === 403) {
        // Session expired. Not a rejection of the set — hold it until she is
        // signed in again, otherwise logging out would eat her work.
        setClaim(next.id, undefined);
        break;
      }
      // 429 and 408 are the queue draining faster than the server will take
      // it, not a rejection: keep them and try again on the next flush. They
      // used to be dropped as "a real 4xx", so a dead-zone session of eight
      // sets could hit the per-minute limit on replay and lose the overflow
      // silently — the dots on the Train screen simply had fewer filled.
      if (status === 429 || status === 408) {
        setClaim(next.id, undefined);
        break;
      }

      // A real 4xx. Replaying it will never succeed, so stop carrying it.
      drop(next.id);
      dropped++;
    }
  }

  return { flushed, dropped, remaining: pendingSets().length };
}

/**
 * Flush on mount, whenever the browser says it is back online, and when the
 * app comes back to the foreground. `onFlushed` fires only when something
 * actually landed, so the caller can refresh the screen once.
 */
export function useFlushPendingSets(onFlushed: () => void) {
  const flush = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (pendingSets().length === 0) return;
    const r = await flushPendingSets();
    if (r.flushed > 0 || r.dropped > 0) onFlushed();
  }, [onFlushed]);

  useEffect(() => {
    void flush();
    const run = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  return flush;
}
