"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import type { PantryView } from "@/lib/views";

/**
 * What is in her kitchen, and what this week's meals will run her out of.
 *
 * Three states, kept apart on purpose: a counted amount, "some" for a thing
 * nobody has counted, and "out" for a thing she has run out of. An uncounted
 * item is never drawn as a number and never counted as covered — it is the
 * state the rest of this app calls unknown, and rendering it as either
 * extreme is how a kitchen list stops being believed.
 */
export function Kitchen({ pantry, expanded = false }: { pantry: PantryView; expanded?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const { items, missing, unknownFor, prepped } = pantry;

  async function run(tool: string, input: Record<string, unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await action<{ ok?: boolean; error?: string }>(tool, input);
      if (r?.ok === false) throw new Error(r.error ?? fallback);
      setEditing(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  /** "2 tins tomatoes", "500g rice", or just "rice" — parsed on the server by
   *  the same reader the recipes go through, so it is one grammar, not two. */
  async function addTyped() {
    const said = adding.trim();
    if (!said) return;
    setAdding("");
    await run("add_to_pantry", { items: [{ item: said }] }, "Couldn't add that.");
  }

  const showing = expanded || open;

  return (
    <section className={expanded ? "" : "card mb-3 p-5"}>
      {expanded ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-faint">What you have in, and what this week will run you out of.</p>
          <span className="shrink-0 text-[13px] tabular text-muted">
            {items.length === 0 ? "empty" : `${items.length} in`}
            {missing.length > 0 && <span className="text-hold"> · {missing.length} to buy</span>}
          </span>
        </div>
      ) : (
        <button onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Kitchen</h2>
          <span className="shrink-0 text-[13px] tabular text-muted">
            {items.length === 0 ? "empty" : `${items.length} in`}
            {missing.length > 0 && <span className="text-hold"> · {missing.length} to buy</span>}
          </span>
        </button>
      )}

      {!open && prepped.length > 0 && (
        <p className="mt-1 text-[12px] text-beat">
          {prepped.map((p) => `${p.portionsLeft} × ${p.title}`).join(", ")} in the fridge
        </p>
      )}

      {!open && prepped.length === 0 && (
        <p className="mt-1 text-[12px] text-faint">
          {items.length === 0
            ? "Tick things off the shopping list with “Got these” and they land here."
            : "What you have in, and what this week's meals will run you out of."}
        </p>
      )}

      {showing && (
        <div className="mt-4 space-y-4">
          {error && <p role="alert" className="text-[13px] text-miss">{error}</p>}

          {prepped.length > 0 && (
            <div className="rounded-xl border border-beat/30 bg-beat-soft p-3.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-beat">
                Already cooked
              </p>
              <ul className="space-y-1">
                {prepped.map((p) => (
                  <li key={p.title} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span>
                      {p.title}
                      {p.pastItsDate && <span className="ml-2 text-[11px] text-hold">past its date</span>}
                    </span>
                    <span className="shrink-0 tabular text-muted">
                      {p.portionsLeft} left
                      {p.caloriesPerPortion !== null && ` · ${p.caloriesPerPortion} kcal`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">
                Tell your coach &ldquo;I had a portion of the {prepped[0].title.toLowerCase()}&rdquo; and it logs
                with the real figures.
              </p>
            </div>
          )}

          {missing.length > 0 && (
            <div className="rounded-xl border border-hold/30 bg-hold-soft p-3.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-hold">
                This week needs
              </p>
              <ul className="space-y-1">
                {missing.map((m) => (
                  <li key={m.item} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span>{m.item}</span>
                    <span className="shrink-0 tabular text-muted">
                      {m.status === "out" ? "you're out" : m.status === "short" ? `${m.needed} needed` : m.needed ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {items.length === 0 && (
            // The guidance used to be gated on !open, so opening the panel to
            // find out how to fill it removed the instructions for filling it.
            <p className="text-[13px] leading-relaxed text-muted">
              Nothing in your kitchen yet. Tick things off the shopping list and tap
              &ldquo;Got these&rdquo;, or add something below — meals take from it as you log them.
            </p>
          )}

          {items.length > 0 && (
            <ul className="divide-y divide-line/60">
              {items.map((i) => (
                <li key={`${i.item}::${i.unit ?? ""}`} className="py-2">
                  <button
                    onClick={() => setEditing(editing === i.item ? null : i.item)}
                    className="flex w-full items-baseline justify-between gap-3 text-left"
                  >
                    <span className="min-w-0 text-[14px]">{i.item}</span>
                    <span
                      className={`shrink-0 text-[12px] tabular ${
                        i.label === "out" ? "text-miss" : i.counted ? "text-muted" : "text-faint"
                      }`}
                    >
                      {i.counted ? i.label : "some — uncounted"}
                    </span>
                  </button>

                  {editing === i.item && (
                    <ItemEditor
                      item={i}
                      busy={busy}
                      onOut={() => run("set_pantry_item",
                        { item: i.item, amount: 0, ...(i.unit ? { unit: i.unit } : {}) },
                        "Couldn't save that.")}
                      onRemove={() => run("remove_pantry_item",
                        { item: i.item, ...(i.unit ? { unit: i.unit } : {}) },
                        "Couldn't remove that.")}
                      onSet={(amount) => run("set_pantry_item",
                        { item: i.item, amount, ...(i.unit ? { unit: i.unit } : {}) },
                        "Couldn't save that.")}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <div className="flex items-center justify-end gap-2">
              {confirmClear ? (
                <>
                  <span className="mr-auto text-[12px] text-muted">
                    Empty the whole kitchen? Everything goes back on the shopping list.
                  </span>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="rounded-lg border border-line px-3 py-2 text-[12px] text-muted"
                  >
                    Keep it
                  </button>
                  <button
                    onClick={() => { setConfirmClear(false); void run("clear_pantry", {}, "Couldn't clear that."); }}
                    disabled={busy}
                    className="rounded-lg border border-miss/50 bg-miss-soft px-3 py-2 text-[12px] text-miss disabled:opacity-40"
                  >
                    Empty it
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="-my-2 px-2 py-2 text-[12px] text-faint underline underline-offset-2"
                >
                  Start fresh
                </button>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); void addTyped(); }}
            className="flex gap-2"
          >
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="Add — e.g. 500g rice, 2 tins tomatoes"
              aria-label="Add something to your kitchen"
              className="min-w-0 flex-1 rounded-xl border border-edge bg-surface px-3.5 py-2.5 text-[14px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !adding.trim()}
              className="shrink-0 rounded-xl border border-line px-3.5 py-2.5 text-[13px] text-accent transition-colors hover:bg-raised disabled:opacity-40"
            >
              Add
            </button>
          </form>

          <p className="text-[11px] leading-relaxed text-faint">
            Logging a planned meal takes its ingredients out of here.
            {unknownFor > 0 && ` ${unknownFor} of this week's ingredients can't be compared to what you have — either nobody counted it or it's measured differently, so it isn't treated as covered or as missing.`}
          </p>
        </div>
      )}
    </section>
  );
}

function ItemEditor({
  item, busy, onSet, onOut, onRemove,
}: {
  item: PantryView["items"][number];
  busy: boolean;
  onSet: (amount: number) => void;
  onOut: () => void;
  onRemove: () => void;
}) {
  const [value, setValue] = useState(item.amount === null ? "" : String(item.amount));

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="how much"
        aria-label={`How much ${item.item}`}
        className="w-24 rounded-lg border border-edge bg-base px-2.5 py-2 text-[14px] tabular focus:border-accent focus:outline-none"
      />
      {item.unit && <span className="text-[12px] text-faint">{item.unit}</span>}
      <button
        onClick={() => { const n = Number(value); if (Number.isFinite(n) && value.trim() !== "") onSet(n); }}
        disabled={busy || value.trim() === "" || !Number.isFinite(Number(value))}
        className="rounded-lg border border-line px-3 py-2 text-[12px] text-accent disabled:opacity-40"
      >
        Save
      </button>
      <button onClick={onOut} disabled={busy}
        className="rounded-lg border border-line px-3 py-2 text-[12px] text-muted disabled:opacity-40">
        Out of it
      </button>
      <button onClick={onRemove} disabled={busy}
        className="rounded-lg border border-line px-3 py-2 text-[12px] text-miss disabled:opacity-40">
        Remove
      </button>
    </div>
  );
}
