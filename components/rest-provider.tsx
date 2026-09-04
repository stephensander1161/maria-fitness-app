"use client";

import {
  createContext, startTransition, useCallback, useContext, useMemo, useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logSetOrQueue, setInput } from "@/lib/offline";
import type { ISODate } from "@/lib/date";
import { RestTimerBar, type Rest } from "@/components/rest-timer";
import { GoScreen } from "@/components/go-screen";

/**
 * The rest timer, hoisted out of the Train screen and into the app.
 *
 * Resting is when she is *least* likely to be looking at Train — she checks
 * what she ate, reads the movement she is about to do, asks the coach
 * something. While this lived inside the training page, walking away from it
 * unmounted the countdown and the alarm never fired at all. So the state lives
 * above the router: the bar follows her onto every screen and the buzz lands
 * wherever she is.
 *
 * It is kept in localStorage rather than React state so it also survives a
 * reload and a second tab. An installed PWA gets killed by the OS with no
 * warning, and coming back to a dead timer mid-workout is the same failure in
 * slower motion — `endsAt` is absolute, so restoring it is just arithmetic.
 */
const KEY = "coach.rest";

/* --------------------------------------------------------------- store --- */

let current: Rest | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Rest | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Rest;
    // The alarm does not give up on its own, so a reload must not do it for
    // her — twenty seconds meant refreshing the page mid-alarm killed it. Ten
    // minutes is long enough to cover a set and a reload, and short enough
    // that opening the app tomorrow is not greeted by a finished timer for a
    // workout she has forgotten about.
    if (typeof r?.endsAt !== "number" || r.endsAt < Date.now() - 600_000) return null;
    return r;
  } catch {
    return null;
  }
}

function emit() {
  for (const l of listeners) l();
}

function write(next: Rest | null) {
  current = next;
  loaded = true;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode, quota — the timer still runs, it just won't survive */
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab moving the timer should move this one. Same workout.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    current = read();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Cached, because useSyncExternalStore compares snapshots by identity and
 * parsing the JSON afresh each time would return a new object every render.
 */
function getSnapshot(): Rest | null {
  if (!loaded) {
    current = read();
    loaded = true;
  }
  return current;
}

/** No localStorage on the server, and none during hydration either. */
const getServerSnapshot = (): Rest | null => null;

/* -------------------------------------------------------------- context --- */

type RestContext = {
  rest: Rest | null;
  /**
   * The rest she has already acknowledged, still waiting on the set itself.
   * Cleared the moment a set is logged — which is also the moment the next
   * rest begins.
   */
  awaiting: Rest | null;
  /** Begin (or restart) rest for a movement. Zero seconds means no rest. */
  start: (r: Rest) => void;
  extend: (seconds: number) => void;
  dismiss: () => void;
  /** The countdown reached zero. Raises the full-screen call to go. */
  fireGo: () => void;
};

const NO_REST: RestContext = {
  rest: null,
  awaiting: null,
  start: () => {},
  extend: () => {},
  dismiss: () => {},
  fireGo: () => {},
};

const Ctx = createContext<RestContext | null>(null);

/**
 * Never throws. A component that offers to start a rest timer is not worth
 * crashing a screen over, and the provider is mounted in the root layout, so
 * the null case only exists in tests and in isolation.
 */
export function useRest(): RestContext {
  return useContext(Ctx) ?? NO_REST;
}

export function RestProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const rest = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [go, setGo] = useState<Rest | null>(null);
  const [awaiting, setAwaiting] = useState<Rest | null>(null);

  const start = useCallback((r: Rest) => {
    if (r.seconds <= 0) return;
    setGo(null);
    // A new rest means a set was just logged, which is exactly the thing the
    // reminder was waiting for.
    setAwaiting(null);
    write(r);
  }, []);

  const extend = useCallback((seconds: number) => {
    const r = getSnapshot();
    if (!r) return;
    write({ ...r, endsAt: Math.max(r.endsAt, Date.now()) + seconds * 1000, seconds: r.seconds + seconds });
  }, []);

  const dismiss = useCallback(() => { setGo(null); setAwaiting(null); write(null); }, []);
  const fireGo = useCallback(() => { setGo(getSnapshot()); }, []);

  /**
   * Clearing the GO screen is not the same as doing the set.
   *
   * She taps it away, lifts, racks the bar, and forgets to log — which is the
   * most common way a session ends up under-recorded, and the app had nothing
   * to say about it. So acknowledging the alarm hands off to a quiet standing
   * reminder that follows her around until the set is actually in.
   */
  const clearGo = useCallback(() => {
    setGo((g) => { setAwaiting(g); return null; });
  }, []);
  const clearAwaiting = useCallback(() => setAwaiting(null), []);

  const value = useMemo(
    () => ({ rest, awaiting, start, extend, dismiss, fireGo }),
    [rest, awaiting, start, extend, dismiss, fireGo],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {go && (
        <GoScreen
          rest={go}
          onLog={async (set) => {
            // Through the offline-aware path, exactly as the card does: a set
            // logged in a basement with no signal is still a set she did.
            await logSetOrQueue(
              setInput(go.slug, set.reps, set.weight, undefined, go.date as ISODate | undefined),
            );
            // And straight back into the next rest, which is the point of
            // logging here rather than on the card.
            setGo(null);
            write({ ...go, endsAt: Date.now() + go.seconds * 1000, reps: set.reps, weight: set.weight });
            setAwaiting(null);
            startTransition(() => router.refresh());
          }}
          onDismiss={clearGo}
        />
      )}
      {!go && awaiting && <LogReminder rest={awaiting} onDismiss={clearAwaiting} />}
    </Ctx.Provider>
  );
}

/**
 * "You haven't logged that set."
 *
 * Deliberately unobtrusive and deliberately persistent: it costs nothing to
 * ignore, it does not cover anything, and it does not go away on its own,
 * because the thing it is waiting for has not happened. Logging the set
 * removes it — so does saying she is done with it.
 */
function LogReminder({ rest, onDismiss }: { rest: Rest; onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "calc(4.5rem + max(env(safe-area-inset-bottom), 0.5rem))" }}
    >
      <div className="flex w-full max-w-sm items-center gap-2 rounded-full border border-accent/40 bg-surface/95 py-2 pl-4 pr-2 shadow-lg shadow-scrim/50 backdrop-blur">
        <p className="min-w-0 flex-1 truncate text-[12px] text-muted">
          Log your {rest.name} set
        </p>
        <Link
          href="/train"
          onClick={onDismiss}
          className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-on-accent"
        >
          Log it
        </Link>
        <button
          onClick={onDismiss}
          aria-label="Dismiss the reminder"
          className="grid size-7 shrink-0 place-items-center rounded-full text-faint hover:text-muted"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Where the bar draws. Separate from the provider because it belongs inside
 * the scrolling pane, and the provider has to wrap the whole app.
 */
export function RestBar() {
  const { rest, extend, dismiss, fireGo } = useRest();
  if (!rest) return null;
  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 md:max-w-5xl md:px-8 md:pt-8 xl:max-w-6xl 2xl:max-w-[100rem] 2xl:px-12">
      <RestTimerBar rest={rest} onExtend={extend} onDismiss={dismiss} onOver={fireGo} />
    </div>
  );
}
