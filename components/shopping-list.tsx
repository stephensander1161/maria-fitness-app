"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { action, actionMessage } from "@/lib/client";
import { prettyDate } from "@/lib/date";
import { shoppingListText } from "@/lib/shopping";

export type ShoppingAisle = {
  aisle: string;
  items: { item: string; quantity: string | null; fromMeals: number }[];
};

/**
 * The week's meals, added up into something you can shop from.
 *
 * Ticks are kept in this browser only, keyed by the week: a shopping list is a
 * thing you use for an hour and throw away, and putting it on the server would
 * mean a stale tick from last Tuesday greeting her in the aisle. They are
 * wrapped in try/catch because a private window or blocked site data makes
 * localStorage throw rather than return nothing.
 */
/**
 * localStorage is an external store, so it is read through the API meant for
 * one rather than copied into state by an effect. The snapshot is the raw
 * string, which is stable to compare — returning a fresh Set each call would
 * spin forever.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    // A private window or blocked site data throws rather than returning null.
    return "[]";
  }
}

/** Whether this browser has a share sheet. Stable per browser, false on the
 *  server, so it is read as an external value rather than set in an effect. */
const noop = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

export function ShoppingList({
  weekStart, aisles, instacart,
}: {
  weekStart: string;
  aisles: ShoppingAisle[];
  /** Whether the server has an Instacart key. Without one the button would
   *  only ever say no. */
  instacart: boolean;
}) {
  const [open, setOpen] = useState(false);
  const storageKey = `shopping:${weekStart}`;
  const canShare = useCanShare();
  const [shared, setShared] = useState<"copied" | null>(null);
  const [sending, setSending] = useState(false);
  const [cart, setCart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const raw = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    // Nothing is ticked on the server, which is also what the first client
    // render must say or hydration disagrees with itself.
    () => "[]",
  );

  const ticked = useMemo<Set<string>>(() => {
    try {
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  }, [raw]);

  function toggle(item: string) {
    const next = new Set(ticked);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Ticking cannot be remembered here, but the list still works.
    }
    notify();
  }

  const total = aisles.reduce((n, a) => n + a.items.length, 0);
  const done = aisles.reduce((n, a) => n + a.items.filter((i) => ticked.has(i.item)).length, 0);
  const title = `Shopping list — week of ${prettyDate(weekStart)}`;

  /** The share sheet where there is one, the clipboard where there isn't —
   *  either way the whole list, since a partner doing the shop wants all of
   *  it, not just what she has not ticked yet. */
  async function share() {
    const text = shoppingListText(title, aisles);
    setError(null);
    try {
      if (canShare) {
        await navigator.share({ title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShared("copied");
      setTimeout(() => setShared(null), 2000);
    } catch (err) {
      // Dismissing the share sheet rejects with AbortError. That is not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Couldn't share the list from here.");
    }
  }

  async function sendToInstacart() {
    setSending(true);
    setError(null);
    try {
      const r = await action<{ ok: boolean; url?: string; error?: string }>(
        "send_shopping_list_to_instacart", { weekStart },
      );
      if (!r.ok || !r.url) throw new Error(r.error ?? "Instacart didn't take the list.");
      setCart(r.url);
      // Popup blockers may refuse a window opened after an await; the link
      // rendered below is the fallback, and also where she comes back to.
      window.open(r.url, "_blank", "noopener");
    } catch (err) {
      setError(actionMessage(err, "Couldn't send the list to Instacart."));
    } finally {
      setSending(false);
    }
  }

  if (total === 0) return null;

  return (
    <section className="card mb-3 p-5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Shopping list</h2>
        <span className="shrink-0 text-[13px] tabular text-muted">
          {done > 0 ? `${done}/${total}` : `${total} items`}
        </span>
      </button>

      {!open && (
        <p className="mt-1 text-[12px] text-faint">
          Everything this week&rsquo;s meals need, added up and grouped by aisle.
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={share}
              className="rounded-full border border-line px-3.5 py-2 text-[13px] text-muted active:bg-raised"
            >
              {shared === "copied" ? "Copied" : canShare ? "Share list" : "Copy list"}
            </button>
            {instacart && (
              <button
                onClick={sendToInstacart}
                disabled={sending}
                className="rounded-full border border-accent/60 bg-accent-soft px-3.5 py-2 text-[13px] text-accent disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send to Instacart"}
              </button>
            )}
          </div>
          {cart && (
            <a
              href={cart}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-beat/40 bg-beat-soft px-4 py-3 text-[14px] text-beat"
            >
              Your cart is ready on Instacart — open it to pick a store and check out. The link works for a week.
            </a>
          )}
          {error && <p className="text-[13px] text-miss">{error}</p>}

          {aisles.map((a) => (
            <div key={a.aisle}>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-accent">{a.aisle}</p>
              <ul>
                {a.items.map((i) => {
                  const isTicked = ticked.has(i.item);
                  return (
                    <li key={i.item}>
                      <button
                        onClick={() => toggle(i.item)}
                        className="flex w-full items-baseline gap-2.5 border-b border-line/60 py-2 text-left last:border-0"
                      >
                        <span
                          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                            isTicked ? "border-accent bg-accent text-ink" : "border-line"
                          }`}
                        >
                          {isTicked && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <span className={`min-w-0 flex-1 text-[14px] ${isTicked ? "text-faint line-through" : ""}`}>
                          {i.item}
                        </span>
                        <span className={`shrink-0 text-[12px] tabular ${isTicked ? "text-faint" : "text-muted"}`}>
                          {i.quantity ?? ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <p className="text-[11px] leading-relaxed text-faint">
            Quantities are added only where the units match, so a weight and a handful of the same
            thing stay on separate lines. Ticks are kept on this phone and reset each week.
          </p>
        </div>
      )}
    </section>
  );
}
