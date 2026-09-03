"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { FoodGlyph } from "./food-glyph";
import { groupForFood, KITCHEN_GROUPS, type KitchenGroup, type KitchenState } from "@/lib/kitchen";

/**
 * The kitchen, as things rather than lists.
 *
 * It was two long columns of text — a shopping list and a pantry — and that
 * is the wrong shape twice. In a supermarket she is scanning for one item
 * among thirty and a list makes her read all thirty in order; at the cupboard
 * she is answering "have I got X", which a list also answers slowly.
 *
 * So it borrows the movement picker exactly: the question anyone asks first
 * is *which sort of thing*, and answering that leaves a handful to look at.
 * Chips with counts, a grid of glyphs, and a search that offers to add
 * whatever she typed when nothing matches.
 *
 * One tap is the whole interaction. A tile opens three buttons — got it, out,
 * gone — and the amounts stay optional, because "some, nobody counted it" is
 * a state this app carries on purpose and typing a number should never be the
 * price of saying you have something.
 */
type Item = {
  item: string;
  category: string | null;
  state: KitchenState;
  label: string;
  needed: string | null;
  extra: boolean;
  unit: string | null;
};

const STATE_STYLE: Record<KitchenState, { ring: string; dot: string; word: string }> = {
  need: { ring: "border-hold/60 bg-hold-soft", dot: "bg-hold", word: "text-hold" },
  out: { ring: "border-miss/50 bg-miss-soft", dot: "bg-miss", word: "text-miss" },
  unknown: { ring: "border-edge bg-surface", dot: "bg-faint", word: "text-faint" },
  in: { ring: "border-line bg-surface", dot: "bg-beat", word: "text-muted" },
};

const STATE_WORD: Record<KitchenState, string> = {
  need: "to buy",
  out: "out",
  // Said in full, because "unknown" on its own reads like an error rather
  // than like the honest answer it is.
  unknown: "can't compare",
  in: "in",
};

export function KitchenGrid({ items, hasMealPlan }: { items: Item[]; hasMealPlan: boolean }) {
  const router = useRouter();
  const [group, setGroup] = useState<KitchenGroup | "buy" | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) {
      const key = groupForFood(i.category);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    map.set("buy", items.filter((i) => i.state === "need" || i.state === "out").length);
    return map;
  }, [items]);

  const shown = useMemo(() => {
    if (q) return items.filter((i) => i.item.toLowerCase().includes(q));
    if (group === "buy") return items.filter((i) => i.state === "need" || i.state === "out");
    if (group) return items.filter((i) => groupForFood(i.category) === group);
    return items;
  }, [items, group, q]);

  const exact = items.some((i) => i.item.toLowerCase() === q);

  async function run(tool: string, input: Record<string, unknown>, fallback: string) {
    setBusy(tool + JSON.stringify(input));
    setError(null);
    try {
      const r = await action<{ ok?: boolean; error?: string }>(tool, input);
      if (r?.ok === false) throw new Error(r.error ?? fallback);
      setOpen(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or add — “rice”, “2 tins tomatoes”"
          aria-label="Search your kitchen, or add something"
          className="min-w-0 flex-1 rounded-xl border border-edge bg-base px-3.5 py-2.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {q && !exact && (
          // The food selector's move: when the search finds nothing, the
          // search box is already the add box. The server reads "2 tins
          // tomatoes" with the same parser recipes go through.
          <button
            onClick={() => run("add_to_pantry", { items: [{ item: query.trim() }] }, "Couldn't add that.")
              .then(() => setQuery(""))}
            disabled={busy !== null}
            className="shrink-0 rounded-xl bg-accent px-4 text-[14px] font-semibold text-ink disabled:opacity-40"
          >
            Add
          </button>
        )}
      </div>

      {!q && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Chip on={group === null} onClick={() => setGroup(null)}>
            Everything<Count n={items.length} />
          </Chip>
          {(counts.get("buy") ?? 0) > 0 && (
            <Chip on={group === "buy"} tone="hold" onClick={() => setGroup(group === "buy" ? null : "buy")}>
              To buy<Count n={counts.get("buy") ?? 0} />
            </Chip>
          )}
          {KITCHEN_GROUPS.map((g) => (
            (counts.get(g.key) ?? 0) > 0 && (
              <Chip key={g.key} on={group === g.key} onClick={() => setGroup(group === g.key ? null : g.key)}>
                {g.label}<Count n={counts.get(g.key) ?? 0} />
              </Chip>
            )
          ))}
          {(counts.get("other") ?? 0) > 0 && (
            <Chip on={group === "other"} onClick={() => setGroup(group === "other" ? null : "other")}>
              Other<Count n={counts.get("other") ?? 0} />
            </Chip>
          )}
        </div>
      )}

      {error && <p role="alert" className="mb-3 text-[13px] text-miss">{error}</p>}

      {shown.length === 0 ? (
        // Not `return null`: a card that disappears is indistinguishable from
        // one that is broken, and she never learns the feature exists.
        <div className="card p-6 text-center">
          <p className="mx-auto max-w-xs text-[13px] leading-relaxed text-faint">
            {q
              ? `Nothing called “${query.trim()}” yet — Add puts it in your kitchen.`
              : items.length === 0
                ? hasMealPlan
                  ? "Nothing in your kitchen yet. Search for something above to add it, or tell your coach what you have in."
                  : "Nothing here yet. Plan some meals and everything they need turns up on this screen, marked against what you already have."
                : "Nothing in that group."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {shown.map((i) => {
            const style = STATE_STYLE[i.state];
            const isOpen = open === i.item;
            return (
              <div
                key={i.item}
                className={`rounded-xl border p-3 transition-colors ${
                  isOpen ? "border-accent bg-accent-soft" : style.ring
                }`}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i.item)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <FoodGlyph category={i.category} className="size-7 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight">{i.item}</span>
                    <span className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${style.word}`}>
                      <span className={`size-1.5 shrink-0 rounded-full ${style.dot}`} />
                      {i.state === "in" ? i.label : STATE_WORD[i.state]}
                      {/* What she already has, when she has some of it. A tile
                          that says only "to buy" for a jar that is a third
                          full sends her to the shop without the one fact that
                          decides whether she needs to go. */}
                      {i.state !== "in" && i.label !== "not in" && i.label !== "out" && (
                        <span className="truncate text-faint">· has {i.label}</span>
                      )}
                      {i.needed && i.state !== "in" && (
                        <span className="truncate text-faint">· need {i.needed}</span>
                      )}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <Act
                      busy={busy !== null}
                      onClick={() => run("add_to_pantry", { items: [{ item: i.item }] }, "Couldn't save that.")}
                    >
                      Got it
                    </Act>
                    <Act
                      busy={busy !== null}
                      onClick={() => run("set_pantry_item",
                        { item: i.item, amount: 0, ...(i.unit ? { unit: i.unit } : {}) },
                        "Couldn't save that.")}
                    >
                      Out
                    </Act>
                    <Act
                      busy={busy !== null}
                      tone="miss"
                      onClick={() => run("remove_pantry_item",
                        { item: i.item, ...(i.unit ? { unit: i.unit } : {}) },
                        "Couldn't remove that.")}
                    >
                      Gone
                    </Act>
                    <p className="col-span-3 pt-1 text-[10px] leading-relaxed text-faint">
                      &ldquo;Got it&rdquo; records that you have some without counting it, which is
                      honest. Tell your coach a number when you want one.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const Count = ({ n }: { n: number }) => <span className="ml-1.5 text-[11px] text-faint tabular">{n}</span>;

function Chip({
  on, tone, onClick, children,
}: { on: boolean; tone?: "hold"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
        on
          ? "border-accent bg-accent-soft text-accent"
          : tone === "hold"
            ? "border-hold/50 text-hold hover:bg-raised"
            : "border-line text-muted hover:bg-raised"
      }`}
    >
      {children}
    </button>
  );
}

function Act({
  busy, tone, onClick, children,
}: { busy: boolean; tone?: "miss"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg border py-1.5 text-[11px] font-medium disabled:opacity-40 ${
        tone === "miss" ? "border-miss/40 text-miss" : "border-edge text-text"
      }`}
    >
      {children}
    </button>
  );
}
