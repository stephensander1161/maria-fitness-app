"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { prettyDate } from "@/lib/date";
import { shoppingListText } from "@/lib/shopping";

export type ShoppingAisle = {
  aisle: string;
  items: {
    item: string;
    quantity: string | null;
    fromMeals: number;
    /** What her kitchen already holds against this line. */
    inKitchen?: "have" | "short" | "out" | "unknown" | "missing";
    shortBy?: string | null;
  }[];
};

/**
 * The week's meals, added up into something you can shop from.
 *
 * A tick is a *selection*, not a strike-through: what she ticks is what gets
 * shared, sent to Instacart, or put away into the kitchen. Sharing used to send
 * the whole list whatever she had chosen, which quietly made the ticks
 * decorative — she would untick the four things she already had, send it, and
 * get all thirty back.
 *
 * Everything starts ticked except what the kitchen already covers, so the
 * common case is one tap. Her own taps always win over that default, and are
 * kept in this browser only, keyed by the week: a shopping list is a thing you
 * use for an hour and throw away, and putting it on the server would mean a
 * stale tick from last Tuesday greeting her in the aisle.
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
    return window.localStorage.getItem(key) ?? "{}";
  } catch {
    // A private window or blocked site data throws rather than returning null.
    return "{}";
  }
}

/** Whether this browser has a share sheet. Stable per browser, false on the
 *  server, so it is read as an external value rather than set in an effect. */
const noop = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

type Choices = { on: string[]; off: string[] };

export function ShoppingList({
  weekStart, aisles, instacart, expanded = false,
}: {
  weekStart: string;
  aisles: ShoppingAisle[];
  /** On its own screen there is nothing to collapse it out of the way of. */
  expanded?: boolean;
  /** Whether the server has an Instacart key. Without one the button would
   *  only ever say no. */
  instacart: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // v2: ticks used to mean "got it, cross it off". They now mean "include it",
  // which is the opposite, so the old key must not be read.
  const storageKey = `shopping:v2:${weekStart}`;
  const canShare = useCanShare();
  const [shared, setShared] = useState<"copied" | null>(null);
  const [sending, setSending] = useState(false);
  const [stocking, setStocking] = useState(false);
  const [stocked, setStocked] = useState<number | null>(null);
  const [cart, setCart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const raw = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    // Nothing is chosen on the server, which is also what the first client
    // render must say or hydration disagrees with itself.
    () => "{}",
  );

  const choices = useMemo<Choices>(() => {
    try {
      const parsed = JSON.parse(raw) as Partial<Choices>;
      return { on: parsed.on ?? [], off: parsed.off ?? [] };
    } catch {
      return { on: [], off: [] };
    }
  }, [raw]);

  const items = aisles.flatMap((a) => a.items);
  /** Already covered by the kitchen, so it starts unticked. */
  const covered = (i: ShoppingAisle["items"][number]) => i.inKitchen === "have";
  const isOn = (i: ShoppingAisle["items"][number]) =>
    choices.on.includes(i.item) ? true : choices.off.includes(i.item) ? false : !covered(i);

  const selected = items.filter(isOn);
  const selectedNames = new Set(selected.map((i) => i.item));

  function write(next: Choices) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Choices cannot be remembered here, but the list still works.
    }
    notify();
  }

  function toggle(item: ShoppingAisle["items"][number]) {
    const on = choices.on.filter((i) => i !== item.item);
    const off = choices.off.filter((i) => i !== item.item);
    if (isOn(item)) off.push(item.item);
    else on.push(item.item);
    write({ on, off });
  }

  const setAll = (value: boolean) =>
    write(value
      ? { on: items.map((i) => i.item), off: [] }
      : { on: [], off: items.map((i) => i.item) });

  const total = items.length;
  const title = `Shopping list — week of ${prettyDate(weekStart)}`;
  /** Only what is ticked, grouped as it is on screen. */
  const chosenAisles = aisles
    .map((a) => ({ ...a, items: a.items.filter((i) => selectedNames.has(i.item)) }))
    .filter((a) => a.items.length > 0);

  async function share() {
    const text = shoppingListText(title, chosenAisles);
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
        "send_shopping_list_to_instacart",
        { weekStart, items: [...selectedNames] },
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

  /** Shopping done: what she ticked goes into the kitchen at the quantities
   *  the list asked for, so the next list knows she has it. */
  async function putAway() {
    setStocking(true);
    setError(null);
    try {
      const r = await action<{ ok: boolean; added: number; error?: string }>(
        "mark_shopping_bought", { weekStart, items: [...selectedNames] },
      );
      if (!r.ok) throw new Error(r.error ?? "That didn't save.");
      setStocked(r.added);
      // The Kitchen card is directly below this one. Without a refresh she was
      // told eight items were in her kitchen while it still read "empty".
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "Couldn't put that into your kitchen."));
    } finally {
      setStocking(false);
    }
  }

  // Not `return null`: a card that disappears is indistinguishable from a card
  // that is broken, and she never learns the feature exists.
  if (total === 0) {
    return (
      <section className={expanded ? "card p-5" : "card mb-3 p-5"}>
        <h2 className="text-[15px] font-semibold">Shopping list</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-faint">
          Nothing to buy yet — this fills in from the week&rsquo;s meals. Ask your coach to plan
          them and everything they need shows up here, grouped by aisle.
        </p>
      </section>
    );
  }

  const showing = expanded || open;

  return (
    <section className={expanded ? "" : "card mb-3 p-5"}>
      {expanded ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-faint">
            Everything this week&rsquo;s meals need, grouped by aisle.
          </p>
          <span className="shrink-0 text-[13px] tabular text-muted">
            {selected.length === total ? `${total} items` : `${selected.length}/${total} chosen`}
          </span>
        </div>
      ) : (
        <>
          <button onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Shopping list</h2>
            <span className="shrink-0 text-[13px] tabular text-muted">
              {selected.length === total ? `${total} items` : `${selected.length}/${total} chosen`}
            </span>
          </button>
          {!open && (
            <p className="mt-1 text-[12px] text-faint">
              Everything this week&rsquo;s meals need, added up and grouped by aisle.
            </p>
          )}
        </>
      )}

      {showing && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={share}
              disabled={selected.length === 0}
              className="rounded-full border border-line px-3.5 py-2 text-[13px] text-muted transition-colors hover:bg-raised active:bg-raised disabled:opacity-40"
            >
              {shared === "copied" ? "Copied" : `${canShare ? "Share" : "Copy"} ${selected.length}`}
            </button>
            {instacart && (
              <button
                onClick={sendToInstacart}
                disabled={sending || selected.length === 0}
                className="rounded-full border border-accent/60 bg-accent-soft px-3.5 py-2 text-[13px] text-accent disabled:opacity-40"
              >
                {sending ? "Sending…" : `Send ${selected.length} to Instacart`}
              </button>
            )}
            <button
              onClick={putAway}
              disabled={stocking || selected.length === 0}
              className="rounded-full border border-line px-3.5 py-2 text-[13px] text-muted transition-colors hover:bg-raised active:bg-raised disabled:opacity-40"
            >
              {stocking ? "Saving…" : "Got these"}
            </button>
            <button
              onClick={() => setAll(selected.length !== total)}
              className="-my-2 ml-auto px-2 py-2 text-[12px] text-faint underline underline-offset-2"
            >
              {selected.length === total ? "Clear all" : "Select all"}
            </button>
          </div>

          {stocked !== null && (
            <p className="rounded-xl border border-beat/40 bg-beat-soft px-3.5 py-2.5 text-[13px] text-beat">
              {stocked} {stocked === 1 ? "item is" : "items are"} in your kitchen now. Meals take from it as
              you log them.
            </p>
          )}
          {cart && (
            <div className="relative">
              <button
                onClick={() => setCart(null)}
                aria-label="Dismiss"
                className="absolute right-2 top-2 grid size-8 place-items-center text-beat/70"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            <a
              href={cart}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-beat/40 bg-beat-soft px-4 py-3 text-[14px] text-beat"
            >
              Your cart is ready on Instacart — open it to pick a store and check out. The link works for a week.
            </a>
            </div>
          )}
          {error && <p role="alert" className="text-[13px] text-miss">{error}</p>}

          {aisles.map((a) => (
            <div key={a.aisle}>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-accent">{a.aisle}</p>
              <ul>
                {a.items.map((i) => {
                  const on = isOn(i);
                  return (
                    <li key={i.item}>
                      <button
                        onClick={() => toggle(i)}
                        aria-pressed={on}
                        className="flex w-full items-baseline gap-2.5 border-b border-line/60 py-2 text-left last:border-0"
                      >
                        <span
                          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                            on ? "border-accent bg-accent text-on-accent" : "border-edge"
                          }`}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`text-[14px] ${on ? "" : "text-faint"}`}>{i.item}</span>
                          <KitchenNote item={i} />
                        </span>
                        <span className={`shrink-0 text-[12px] tabular ${on ? "text-muted" : "text-faint"}`}>
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
            Ticked is what gets shared, sent or put away. Things your kitchen already covers start
            unticked. Quantities are added only where the units match, so a weight and a handful of the
            same thing stay on separate lines. Choices are kept on this phone and reset each week.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * What the kitchen says about this line. "Some, uncounted" is deliberately not
 * rendered as "you have it" — that is the difference between a list she
 * believes and one she stops reading.
 */
function KitchenNote({ item }: { item: ShoppingAisle["items"][number] }) {
  if (item.inKitchen === "have") {
    return <span className="ml-2 text-[11px] text-beat">in your kitchen</span>;
  }
  if (item.inKitchen === "short") {
    return (
      <span className="ml-2 text-[11px] text-hold">
        {item.shortBy ? `${item.shortBy} short` : "not enough"}
      </span>
    );
  }
  if (item.inKitchen === "out") {
    return <span className="ml-2 text-[11px] text-miss">out</span>;
  }
  if (item.inKitchen === "unknown") {
    return <span className="ml-2 text-[11px] text-faint">you have some — uncounted</span>;
  }
  return null;
}
