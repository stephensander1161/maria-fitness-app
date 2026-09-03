"use client";

import {
  createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore,
} from "react";
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
    // Anything well past its end is stale — she closed the app an hour ago,
    // and this would greet her with a finished timer for a forgotten set.
    if (typeof r?.endsAt !== "number" || r.endsAt < Date.now() - 20_000) return null;
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
  /** Begin (or restart) rest for a movement. Zero seconds means no rest. */
  start: (r: Rest) => void;
  extend: (seconds: number) => void;
  dismiss: () => void;
  /** The countdown reached zero. Raises the full-screen call to go. */
  fireGo: () => void;
};

const NO_REST: RestContext = {
  rest: null,
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
  const rest = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [go, setGo] = useState<Rest | null>(null);

  const start = useCallback((r: Rest) => {
    if (r.seconds <= 0) return;
    setGo(null);
    write(r);
  }, []);

  const extend = useCallback((seconds: number) => {
    const r = getSnapshot();
    if (!r) return;
    write({ ...r, endsAt: Math.max(r.endsAt, Date.now()) + seconds * 1000, seconds: r.seconds + seconds });
  }, []);

  const dismiss = useCallback(() => { setGo(null); write(null); }, []);
  const fireGo = useCallback(() => { setGo(getSnapshot()); }, []);

  const value = useMemo(
    () => ({ rest, start, extend, dismiss, fireGo }),
    [rest, start, extend, dismiss, fireGo],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {go && <GoScreen name={go.name} slug={go.slug} category={go.category} onDismiss={dismiss} />}
    </Ctx.Provider>
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
    <div className="mx-auto w-full max-w-lg px-4 md:max-w-5xl md:px-8">
      <RestTimerBar rest={rest} onExtend={extend} onDismiss={dismiss} onOver={fireGo} />
    </div>
  );
}
