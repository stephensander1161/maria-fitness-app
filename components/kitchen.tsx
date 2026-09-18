"use client";

import { startTransition, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { prettyDate } from "@/lib/date";
import { shoppingListText } from "@/lib/shopping";
import { groupForFood, KITCHEN_GROUPS, type KitchenGroup, type KitchenState } from "@/lib/kitchen";
import { FoodGlyph } from "./food-glyph";

/**
 * The Kitchen: what to buy, and what is in.
 *
 * It was a grid of fifty-five identical yellow tiles with the amounts cut
 * off at "need 2 ra…", and then — a screen's height below — the same food
 * again as a shopping list, grouped a different way. Two views of one thing,
 * neither answering the question the screen exists for. "UI/UX is bad."
 *
 * So: one list, two views of it. **To buy** is the week's meals added up,
 * by aisle, each line saying how many meals want it and what she already
 * has; ticked is what gets shared, sent to Instacart or put away. **In the
 * kitchen** is what she has, searchable, with the three things she can say
 * about any of it. A phone shows one at a time and opens on whichever has
 * work in it; a desktop shows both.
 *
 * The rules under it have not moved: "some, nobody counted it" is never
 * "have", a tick is a selection and not a strike-through, and the choices
 * are kept on this phone for this week only — a shopping list is a thing
 * you use for an hour and throw away.
 */
export type ShoppingAisle = {
  aisle: string;
  items: {
    item: string;
    quantity: string | null;
    fromMeals: number;
    inKitchen?: "have" | "short" | "out" | "unknown" | "missing";
    shortBy?: string | null;
  }[];
};

export type PantryRow = {
  item: string;
  category: string | null;
  state: KitchenState;
  label: string;
  needed: string | null;
  extra: boolean;
  unit: string | null;
};

type Line = ShoppingAisle["items"][number];
type View = "buy" | "have";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => { listeners.delete(onChange); window.removeEventListener("storage", onChange); };
}
const readStore = (key: string): string => { try { return window.localStorage.getItem(key) ?? "{}"; } catch { return "{}"; } };
const noop = () => () => {};
const useCanShare = () => useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

type Choices = { on: string[]; off: string[] };

/** Retailers a Canadian list can land in through Instacart — said so she knows what the button is for. */
export const INSTACART_STORES = "Costco, Superstore, Walmart, Save-On-Foods and Safeway";

export function Kitchen({ weekStart, mealsCovered, hasMealPlan, instacart, aisles, pantry, categories }: {
  weekStart: string;
  mealsCovered: number;
  hasMealPlan: boolean;
  instacart: boolean;
  aisles: ShoppingAisle[];
  pantry: PantryRow[];
  /** Food category by item name, for the glyph on a shopping line. */
  categories: Record<string, string | null>;
}) {
  const router = useRouter();
  const lines = aisles.flatMap((a) => a.items);
  const toBuy = lines.filter((l) => l.inKitchen !== "have");
  // Open on whichever view has work in it: a list with things to buy, else the cupboard.
  const [view, setView] = useState<View>(toBuy.length > 0 ? "buy" : "have");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="md:grid md:grid-cols-2 md:items-start md:gap-6">
      {/* One at a time on a phone; the segmented control is the only chrome. */}
      <div role="tablist" aria-label="Kitchen" className="mb-4 grid grid-cols-2 rounded-xl border border-line bg-surface p-1 md:hidden">
        <Tab on={view === "buy"} onClick={() => setView("buy")} count={toBuy.length}>To buy</Tab>
        <Tab on={view === "have"} onClick={() => setView("have")} count={pantry.filter((p) => p.state !== "need").length}>In the kitchen</Tab>
      </div>

      <section className={view === "buy" ? "" : "hidden md:block"} aria-label="To buy">
        <h2 className="mb-2 hidden text-[15px] font-semibold md:block">To buy</h2>
        <ToBuy weekStart={weekStart} mealsCovered={mealsCovered} hasMealPlan={hasMealPlan} instacart={instacart}
          aisles={aisles} categories={categories} onError={setError} />
      </section>

      <section className={view === "have" ? "" : "hidden md:block"} aria-label="In the kitchen">
        <h2 className="mb-2 hidden text-[15px] font-semibold md:block">In the kitchen</h2>
        <InTheKitchen pantry={pantry} onError={setError} onChanged={() => startTransition(() => router.refresh())} />
      </section>

      {error && <p role="alert" className="mt-3 text-[13px] text-miss md:col-span-2">{error}</p>}
    </div>
  );
}

function Tab({ on, count, onClick, children }: { on: boolean; count: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick}
      className={`rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${on ? "bg-accent-soft text-accent" : "text-muted"}`}>
      {children}<span className="ml-1.5 text-[11px] tabular opacity-70">{count}</span>
    </button>
  );
}

/* ───────────────────────────── To buy ───────────────────────────── */

function ToBuy({ weekStart, mealsCovered, hasMealPlan, instacart, aisles, categories, onError }: {
  weekStart: string; mealsCovered: number; hasMealPlan: boolean; instacart: boolean;
  aisles: ShoppingAisle[]; categories: Record<string, string | null>; onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const storageKey = `shopping:v2:${weekStart}`;
  const canShare = useCanShare();
  const raw = useSyncExternalStore(subscribe, () => readStore(storageKey), () => "{}");
  const choices = useMemo<Choices>(() => {
    try { const p = JSON.parse(raw) as Partial<Choices>; return { on: p.on ?? [], off: p.off ?? [] }; } catch { return { on: [], off: [] }; }
  }, [raw]);
  const [busy, setBusy] = useState<"share" | "send" | "stock" | null>(null);
  const [note, setNote] = useState<{ tone: "beat"; text: string; href?: string } | null>(null);
  const [showHave, setShowHave] = useState(false);

  const lines = aisles.flatMap((a) => a.items);
  const covered = (l: Line) => l.inKitchen === "have";
  const isOn = (l: Line) => choices.on.includes(l.item) ? true : choices.off.includes(l.item) ? false : !covered(l);
  const selected = lines.filter(isOn);
  const selectedNames = new Set(selected.map((l) => l.item));
  const write = (next: Choices) => { try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* per-phone convenience */ } notify(); };
  const toggle = (l: Line) => {
    const on = choices.on.filter((i) => i !== l.item); const off = choices.off.filter((i) => i !== l.item);
    if (isOn(l)) off.push(l.item); else on.push(l.item);
    write({ on, off });
  };
  const setAll = (value: boolean) => write(value ? { on: lines.map((l) => l.item), off: [] } : { on: [], off: lines.map((l) => l.item) });

  const needAisles = aisles.map((a) => ({ ...a, items: a.items.filter((l) => !covered(l)) })).filter((a) => a.items.length > 0);
  const haveLines = lines.filter(covered);
  const title = `Shopping list — week of ${prettyDate(weekStart)}`;
  const chosen = aisles.map((a) => ({ ...a, items: a.items.filter((l) => selectedNames.has(l.item)) })).filter((a) => a.items.length > 0);

  async function share() {
    onError(null); setBusy("share");
    try {
      const text = shoppingListText(title, chosen);
      if (canShare) await navigator.share({ title, text });
      else { await navigator.clipboard.writeText(text); setNote({ tone: "beat", text: "Copied — paste it anywhere." }); }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) onError("Couldn't share the list from here.");
    } finally { setBusy(null); }
  }
  async function sendToInstacart() {
    onError(null); setBusy("send");
    try {
      const r = await action<{ ok: boolean; url?: string; error?: string }>("send_shopping_list_to_instacart", { weekStart, items: [...selectedNames] });
      if (!r.ok || !r.url) throw new Error(r.error ?? "Instacart didn't take the list.");
      setNote({ tone: "beat", text: "Your cart is ready on Instacart — pick a store and check out. The link works for a week.", href: r.url });
      window.open(r.url, "_blank", "noopener");
    } catch (err) { onError(actionMessage(err, "Couldn't send the list to Instacart.")); }
    finally { setBusy(null); }
  }
  async function putAway() {
    onError(null); setBusy("stock");
    try {
      const r = await action<{ ok: boolean; added: number; error?: string }>("mark_shopping_bought", { weekStart, items: [...selectedNames] });
      if (!r.ok) throw new Error(r.error ?? "That didn't save.");
      setNote({ tone: "beat", text: `${r.added} ${r.added === 1 ? "item is" : "items are"} in your kitchen now. Meals take from it as you log them.` });
      startTransition(() => router.refresh());
    } catch (err) { onError(actionMessage(err, "Couldn't put that into your kitchen.")); }
    finally { setBusy(null); }
  }

  if (lines.length === 0) {
    return (
      <div className="card p-5">
        <p className="text-[14px] font-medium">Nothing to buy</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {hasMealPlan
            ? "This week's meals are covered by what you have."
            : "The list fills in from the week's meals. Ask your coach to plan them — “plan my meals for the week” — and everything they need lands here, by aisle."}
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-0">
      <p className="mb-3 text-[13px] text-muted">
        {mealsCovered > 0 ? `For ${mealsCovered} meal${mealsCovered === 1 ? "" : "s"} this week` : "This week"} ·{" "}
        <span className="tabular">{selected.length === lines.length ? `${lines.length} items` : `${selected.length} of ${lines.length} ticked`}</span>
        <button type="button" onClick={() => setAll(selected.length !== lines.length)} className="ml-2 text-[12px] text-faint underline underline-offset-2">
          {selected.length === lines.length ? "Clear" : "Tick all"}
        </button>
      </p>

      {note && (
        <div className="relative mb-3 rounded-xl border border-beat/40 bg-beat-soft px-4 py-3 pr-10 text-[13px] text-beat">
          {note.href ? <a href={note.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{note.text}</a> : note.text}
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss" className="absolute right-2 top-2 grid size-7 place-items-center text-beat/70">×</button>
        </div>
      )}

      {needAisles.map((a) => (
        <div key={a.aisle} className="mb-4">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-accent">{a.aisle}</p>
          <ul className="card divide-y divide-line/60 px-3">
            {a.items.map((l) => <Row key={l.item} line={l} on={isOn(l)} category={categories[l.item] ?? null} onToggle={() => toggle(l)} />)}
          </ul>
        </div>
      ))}

      {haveLines.length > 0 && (
        <div className="mb-4">
          <button type="button" onClick={() => setShowHave(!showHave)} aria-expanded={showHave}
            className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-faint">
            Already in your kitchen <span className="tabular">{haveLines.length}</span>
            <span aria-hidden className={`transition-transform ${showHave ? "rotate-180" : ""}`}>⌄</span>
          </button>
          {showHave && (
            <ul className="card divide-y divide-line/60 px-3">
              {haveLines.map((l) => <Row key={l.item} line={l} on={isOn(l)} category={categories[l.item] ?? null} onToggle={() => toggle(l)} />)}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-faint">
        Ticked is what gets shared, sent or put away. Amounts are added only where the units match, so a weight and a handful stay separate lines.
      </p>

      {/*
        The three things a list is for, where a thumb is: fixed above the tab
        bar on a phone, in the flow on a desktop.
      */}
      <div className="fixed inset-x-0 z-30 border-t border-line/60 bg-base/95 px-4 py-2.5 backdrop-blur md:static md:mt-4 md:rounded-xl md:border md:bg-surface"
        // Above the tab bar, and above whatever the browser's own toolbar covers — see components/viewport-cover.tsx.
        style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px) + var(--covered-bottom, 0px))" }}
        data-shopping-actions="">
        <div className="mx-auto flex max-w-lg items-center gap-2 md:max-w-none">
          <button type="button" onClick={share} disabled={busy !== null || selected.length === 0}
            className="flex-1 rounded-xl border border-line py-2.5 text-[13px] font-medium text-text disabled:opacity-40">
            {busy === "share" ? "…" : canShare ? "Share" : "Copy"}
          </button>
          {instacart ? (
            <button type="button" onClick={sendToInstacart} disabled={busy !== null || selected.length === 0}
              className="flex-[1.6] rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-on-accent disabled:opacity-40">
              {busy === "send" ? "Sending…" : `Instacart · ${selected.length}`}
            </button>
          ) : (
            <span className="flex-[1.6] truncate px-1 text-center text-[11px] leading-tight text-faint" title={`Instacart delivers from ${INSTACART_STORES}`}>
              Instacart soon
            </span>
          )}
          <button type="button" onClick={putAway} disabled={busy !== null || selected.length === 0}
            className="flex-1 rounded-xl border border-line py-2.5 text-[13px] font-medium text-text disabled:opacity-40">
            {busy === "stock" ? "Saving…" : "Got these"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ line, on, category, onToggle }: { line: Line; on: boolean; category: string | null; onToggle: () => void }) {
  const sub = [
    line.fromMeals > 0 ? `for ${line.fromMeals} meal${line.fromMeals === 1 ? "" : "s"}` : null,
    line.inKitchen === "have" ? "in your kitchen"
      : line.inKitchen === "short" ? (line.shortBy ? `${line.shortBy} short` : "not enough")
        : line.inKitchen === "out" ? "out"
          : line.inKitchen === "unknown" ? "you have some — uncounted"
            : null,
  ].filter(Boolean).join(" · ");
  return (
    <li>
      <button type="button" onClick={onToggle} aria-pressed={on} className="flex w-full items-center gap-3 py-2.5 text-left">
        <span className={`grid size-5 shrink-0 place-items-center rounded border ${on ? "border-accent bg-accent text-on-accent" : "border-edge"}`}>
          {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
        </span>
        <FoodGlyph category={category} className="size-5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] ${on ? "" : "text-faint"}`}>{line.item}</span>
          {sub && <span className={`block truncate text-[11px] ${line.inKitchen === "out" ? "text-miss" : line.inKitchen === "short" ? "text-hold" : "text-faint"}`}>{sub}</span>}
        </span>
        <span className={`shrink-0 text-[13px] tabular ${on ? "text-muted" : "text-faint"}`}>{line.quantity ?? ""}</span>
      </button>
    </li>
  );
}

/* ───────────────────────── In the kitchen ───────────────────────── */

const STATE_WORD: Record<KitchenState, string> = { need: "to buy", out: "out", unknown: "can't compare", in: "in" };
const STATE_DOT: Record<KitchenState, string> = { need: "bg-hold", out: "bg-miss", unknown: "bg-faint", in: "bg-beat" };

function InTheKitchen({ pantry, onError, onChanged }: { pantry: PantryRow[]; onError: (m: string | null) => void; onChanged: () => void }) {
  const [group, setGroup] = useState<KitchenGroup | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  // What she has: never the lines that only exist because a meal wants them.
  const stock = pantry.filter((p) => p.state !== "need" || p.extra);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of stock) { const k = groupForFood(p.category); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [stock]);
  const shown = (q ? stock.filter((p) => p.item.toLowerCase().includes(q)) : group ? stock.filter((p) => groupForFood(p.category) === group) : stock)
    .slice().sort((a, b) => a.item.localeCompare(b.item));
  const exact = stock.some((p) => p.item.toLowerCase() === q);

  async function run(tool: string, input: Record<string, unknown>, fallback: string) {
    setBusy(true); onError(null);
    try {
      const r = await action<{ ok?: boolean; error?: string }>(tool, input);
      if (r?.ok === false) throw new Error(r.error ?? fallback);
      setOpen(null); onChanged();
    } catch (err) { onError(actionMessage(err, fallback)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, or add — “rice”, “2 tins tomatoes”"
          aria-label="Search your kitchen, or add something"
          className="min-w-0 flex-1 rounded-xl border border-edge bg-base px-3.5 py-2.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none" />
        {q && !exact && (
          <button type="button" disabled={busy} onClick={() => run("add_to_pantry", { items: [{ item: query.trim() }] }, "Couldn't add that.").then(() => setQuery(""))}
            className="shrink-0 rounded-xl bg-accent px-4 text-[14px] font-semibold text-on-accent disabled:opacity-40">Add</button>
        )}
      </div>
      {!q && stock.length > 6 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip on={group === null} onClick={() => setGroup(null)}>All <span className="text-[11px] opacity-70">{stock.length}</span></Chip>
          {[...KITCHEN_GROUPS.map((g) => ({ key: g.key as KitchenGroup, label: g.label })), { key: "other" as KitchenGroup, label: "Other" }]
            .filter((g) => (counts.get(g.key) ?? 0) > 0)
            .map((g) => <Chip key={g.key} on={group === g.key} onClick={() => setGroup(group === g.key ? null : g.key)}>{g.label} <span className="text-[11px] opacity-70">{counts.get(g.key)}</span></Chip>)}
        </div>
      )}
      {shown.length === 0 ? (
        <div className="card p-5 text-[13px] leading-relaxed text-faint">
          {q ? `Nothing called “${query.trim()}” yet — Add puts it in your kitchen.` : "Nothing in your kitchen yet. Add something above, or tell your coach what you have in."}
        </div>
      ) : (
        <ul className="card divide-y divide-line/60 px-3">
          {shown.map((p) => {
            const isOpen = open === p.item;
            return (
              <li key={p.item}>
                <button type="button" onClick={() => setOpen(isOpen ? null : p.item)} aria-expanded={isOpen} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <FoodGlyph category={p.category} className="size-5 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{p.item}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                    <span className={`size-1.5 rounded-full ${STATE_DOT[p.state]}`} />
                    {p.state === "in" ? p.label : STATE_WORD[p.state]}
                    {p.state !== "in" && p.label !== "not in" && p.label !== "out" && <span className="text-faint">· has {p.label}</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-3 gap-1 pb-3">
                    <Act busy={busy} onClick={() => run("add_to_pantry", { items: [{ item: p.item }] }, "Couldn't save that.")}>Have some</Act>
                    <Act busy={busy} onClick={() => run("set_pantry_item", { item: p.item, amount: 0, ...(p.unit ? { unit: p.unit } : {}) }, "Couldn't save that.")}>Ran out</Act>
                    <Act busy={busy} tone="miss" onClick={() => run("remove_pantry_item", { item: p.item, ...(p.unit ? { unit: p.unit } : {}) }, "Couldn't remove that.")}>Remove</Act>
                    <p className="col-span-3 pt-1 text-[10px] leading-relaxed text-faint">
                      <strong className="font-medium text-muted">Ran out</strong> keeps it on the list. <strong className="font-medium text-muted">Remove</strong> takes it off for good. Tell your coach a number when you want it counted.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-raised"}`}>
    {children}
  </button>
);
const Act = ({ busy, tone, onClick, children }: { busy: boolean; tone?: "miss"; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} disabled={busy}
    className={`rounded-lg border py-1.5 text-[11px] font-medium disabled:opacity-40 ${tone === "miss" ? "border-miss/40 text-miss" : "border-edge text-text"}`}>
    {children}
  </button>
);
