import { afterEach, beforeEach, describe as suite, expect, it, vi } from "vitest";

/**
 * The queue that makes a gym basement survivable.
 *
 * Everything here is about what happens to a set she has already performed.
 * Losing one is worse than any error message: she did the work, the dots did
 * not fill in, and there is nothing she can do about it afterwards.
 *
 * Runs against a fake localStorage because the module is a browser one; the
 * behaviour under test is the ordering and the retry classification, which is
 * where the bugs live.
 */
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  });
  vi.stubGlobal("localStorage", (globalThis as { window: { localStorage: unknown } }).window.localStorage);
  vi.resetModules();
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** A failure of the shape lib/client.ts produces. */
class Failure extends Error {
  constructor(readonly status: number | null) { super(`status ${status}`); this.name = "ActionError"; }
  get isNetworkFailure() { return this.status === null; }
  get retriable() { return this.status === null || this.status >= 500; }
}

async function load(responses: (() => Promise<unknown>)[]) {
  const calls: Record<string, unknown>[] = [];
  vi.doMock("@/lib/client", () => ({
    ActionError: Failure,
    action: async (_tool: string, input: Record<string, unknown>) => {
      calls.push(input);
      const next = responses.shift() ?? (async () => ({ ok: true }));
      return next();
    },
  }));
  const mod = await import("@/lib/offline");
  return { mod, calls };
}

const set = (reps: number) => ({
  exerciseSlug: "goblet-squat", reps, weight: 20,
  date: "2026-09-02", clientKey: `key-${reps}`,
});

suite("logging a set with no signal", () => {
  it("parks it rather than losing it", async () => {
    const { mod } = await load([async () => { throw new Failure(null); }]);
    const outcome = await mod.logSetOrQueue(set(8));
    expect(outcome.queued).toBe(true);
    expect(mod.pendingSets()).toHaveLength(1);
  });

  it("does not park a rejection that will never succeed", async () => {
    // A 400 means the set was wrong, not the network. Carrying it forever
    // would replay a failure on every flush.
    const { mod } = await load([async () => { throw new Failure(400); }]);
    await expect(mod.logSetOrQueue(set(8))).rejects.toThrow();
    expect(mod.pendingSets()).toHaveLength(0);
  });

  it("keeps the date she performed it on, not the date it flushes", async () => {
    // A set logged at 11pm and flushed at 7am belongs to yesterday's session.
    const { mod, calls } = await load([
      async () => { throw new Failure(null); },
      async () => ({ ok: true }),
    ]);
    await mod.logSetOrQueue(set(8));
    await mod.flushPendingSets();
    expect(calls[1].date).toBe("2026-09-02");
  });
});

suite("draining the queue", () => {
  it("replays in the order she performed them", async () => {
    const { mod, calls } = await load([
      async () => { throw new Failure(null); },
      async () => { throw new Failure(null); },
      async () => { throw new Failure(null); },
    ]);
    for (const reps of [8, 7, 6]) await mod.logSetOrQueue(set(reps));

    const result = await mod.flushPendingSets();
    expect(result.flushed).toBe(3);
    expect(calls.slice(3).map((c) => c.reps)).toEqual([8, 7, 6]);
    expect(mod.pendingSets()).toHaveLength(0);
  });

  it("stops at the first one that still cannot send, keeping the order", async () => {
    const { mod } = await load([
      async () => { throw new Failure(null); },
      async () => { throw new Failure(null); },
      async () => { throw new Failure(null); },  // first replay: still offline
    ]);
    await mod.logSetOrQueue(set(8));
    await mod.logSetOrQueue(set(7));

    const result = await mod.flushPendingSets();
    expect(result.flushed).toBe(0);
    // Both still there, and in order — not skipped past.
    expect(mod.pendingSets().map((p) => p.input.reps)).toEqual([8, 7]);
  });

  it("holds everything when the session has expired instead of eating her work", async () => {
    const { mod } = await load([
      async () => { throw new Failure(null); },
      async () => { throw new Failure(401); },
    ]);
    await mod.logSetOrQueue(set(8));
    const result = await mod.flushPendingSets();
    expect(result.dropped).toBe(0);
    expect(mod.pendingSets()).toHaveLength(1);
  });

  it("keeps a rate-limited set instead of dropping it as a 4xx", async () => {
    // 429 is the queue draining faster than the server will take it. Dropped
    // as "a real 4xx", a dead-zone session quietly lost its overflow.
    const { mod } = await load([
      async () => { throw new Failure(null); },
      async () => { throw new Failure(429); },
    ]);
    await mod.logSetOrQueue(set(8));
    const result = await mod.flushPendingSets();
    expect(result.dropped).toBe(0);
    expect(mod.pendingSets()).toHaveLength(1);
  });

  it("drops one the server genuinely rejects, and says so", async () => {
    const { mod } = await load([
      async () => { throw new Failure(null); },
      async () => { throw new Failure(422); },
    ]);
    await mod.logSetOrQueue(set(8));
    const result = await mod.flushPendingSets();
    expect(result.dropped).toBe(1);
    expect(mod.pendingSets()).toHaveLength(0);
  });

  it("runs one drain at a time, however many times it is asked", async () => {
    const { mod, calls } = await load([async () => { throw new Failure(null); }]);
    await mod.logSetOrQueue(set(8));
    const [a, b] = await Promise.all([mod.flushPendingSets(), mod.flushPendingSets()]);
    expect(a).toBe(b);
    // One replay, not two: a double flush must not double-log.
    expect(calls.filter((c) => c.reps === 8)).toHaveLength(2); // the original + one replay
  });
});

suite("the client key", () => {
  it("is minted once and replayed unchanged, so a retry cannot double-log", async () => {
    const { mod, calls } = await load([
      async () => { throw new Failure(null); },
      async () => ({ ok: true }),
    ]);
    await mod.logSetOrQueue(set(8));
    await mod.flushPendingSets();
    expect(calls[0].clientKey).toBe(calls[1].clientKey);
  });

  it("differs between two sets minted from the same inputs", () => {
    const a = { exerciseSlug: "x", reps: 8, weight: 20 };
    // setInput mints a fresh key per call — otherwise two identical sets
    // would dedupe against each other on the server.
    return load([]).then(({ mod }) => {
      const one = mod.setInput(a.exerciseSlug, a.reps, a.weight);
      const two = mod.setInput(a.exerciseSlug, a.reps, a.weight);
      expect(one.clientKey).not.toBe(two.clientKey);
    });
  });
});
