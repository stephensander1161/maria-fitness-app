"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * One search for an ingredient, answering the four questions she actually has:
 * what is it, have I got any, what am I supposed to be making with it, and
 * what else could I make.
 *
 * They used to be four different places — the calculator for macros, the
 * kitchen card for stock, the meal plan for what uses it, the coach for ideas.
 * This is one call to search_ingredient, which is the same tool the coach uses
 * when she asks out loud.
 */
type Result = {
  query: string;
  food: {
    name: string;
    category: string;
    per100g: { kcal: number; proteinG: number; carbsG: number; fatG: number; fibreG: number | null };
    naturalUnit: string | null;
    alsoCalled: string[];
  } | null;
  inKitchen: { item: string; amount: string | null; counted: boolean; out: boolean }[];
  inKitchenMeaning?: string;
  plannedThisWeek: { mealId: string; dayName: string; slot: string; title: string; calories: number; proteinG: number }[];
  couldMake: { title: string; slot: string; calories: number; proteinG: number; prepMinutes: number | null }[];
};

export function IngredientSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const latest = useRef(0);

  // Searched as she types, but only after she stops: this is a database read,
  // not a model call, so it is cheap — and a stale response must never
  // overwrite a newer one, hence the sequence number.
  useEffect(() => {
    const q = query.trim();
    // Nothing to clear here: what is on screen is derived from the query below,
    // so an emptied box shows nothing without a second render to say so.
    if (q.length < 2) return;

    const id = ++latest.current;
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const r = await action<Result>("search_ingredient", { ingredient: q });
        if (id === latest.current) { setResult(r); setError(null); }
      } catch (err) {
        if (id === latest.current) setError(actionMessage(err, "Couldn't look that up."));
      } finally {
        if (id === latest.current) setBusy(false);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [query]);

  async function addToKitchen() {
    if (!result) return;
    setAdding(true);
    setError(null);
    try {
      await action("add_to_pantry", { items: [{ item: result.food?.name ?? result.query }] });
      const r = await action<Result>("search_ingredient", { ingredient: query.trim() });
      setResult(r);
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "Couldn't add that to your kitchen."));
    } finally {
      setAdding(false);
    }
  }

  // Derived, not stored: a stale result must not flash while she retypes.
  const short = query.trim().length < 2;
  const shown = short ? null : result;
  const shownError = short ? null : error;

  return (
    <>
      <div className="relative mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an ingredient — chicken, oats, eggs…"
          aria-label="Search an ingredient"
          enterKeyHint="search"
          className="w-full rounded-xl border border-edge bg-surface px-4 py-3 text-[16px] placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear"
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-faint"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>

      {shownError && <p role="alert" className="mb-3 text-[13px] text-miss">{shownError}</p>}

      {short && (
        <p className="card p-5 text-[13px] leading-relaxed text-muted">
          Type an ingredient to see what it is, whether it&rsquo;s in your kitchen, which of this
          week&rsquo;s meals use it, and what else you could make with it.
        </p>
      )}

      {busy && !shown && (
        <div className="flex justify-center gap-1.5 py-8">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent"
              style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      )}

      {shown && (
        <div className={`space-y-3 ${busy ? "opacity-60" : ""}`}>
          {shown.food ? (
            <section className="card p-5">
              <h2 className="text-[17px] font-semibold">{shown.food.name}</h2>
              <p className="mt-0.5 text-[12px] capitalize text-faint">
                {shown.food.category}
                {shown.food.naturalUnit && ` · ${shown.food.naturalUnit}`}
              </p>
              <div className="mt-3 flex divide-x divide-line">
                <Macro label="kcal" value={shown.food.per100g.kcal} />
                <Macro label="protein" value={`${shown.food.per100g.proteinG}g`} />
                <Macro label="carbs" value={`${shown.food.per100g.carbsG}g`} />
                <Macro label="fat" value={`${shown.food.per100g.fatG}g`} />
              </div>
              <p className="mt-2 text-[11px] text-faint">
                Per 100g
                {shown.food.per100g.fibreG !== null && ` · ${shown.food.per100g.fibreG}g fibre`}
              </p>
            </section>
          ) : (
            <section className="card p-5">
              <h2 className="text-[15px] font-semibold">{shown.query}</h2>
              <p className="mt-1 text-[13px] text-muted">
                Not in the food library, so there are no macros for it here. Your coach can still
                estimate it — ask, or log it in the calculator on the Plan screen.
              </p>
            </section>
          )}

          <Section title="In your kitchen">
            {shown.inKitchen.length === 0 ? (
              <div>
                <p className="text-[13px] text-muted">
                  Nothing by that name in your kitchen list — which isn&rsquo;t the same as being out.
                </p>
                <button
                  onClick={addToKitchen}
                  disabled={adding}
                  className="mt-2.5 rounded-full border border-line px-3.5 py-2 text-[13px] text-accent disabled:opacity-40"
                >
                  {adding ? "Adding…" : "Add to kitchen"}
                </button>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {shown.inKitchen.map((k) => (
                  <li key={k.item} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span>{k.item}</span>
                    <span className={`shrink-0 tabular ${k.out ? "text-miss" : k.counted ? "text-muted" : "text-faint"}`}>
                      {k.out ? "out" : k.counted ? k.amount : "some — uncounted"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {shown.plannedThisWeek.length > 0 && (
            <Section title="This week uses it">
              <ul className="space-y-1.5">
                {shown.plannedThisWeek.map((m) => (
                  <li key={m.mealId} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0">
                      <span className="mr-2 text-[11px] uppercase tracking-wide text-accent">
                        {m.dayName.slice(0, 3)} {m.slot}
                      </span>
                      {m.title}
                    </span>
                    <span className="shrink-0 text-[12px] tabular text-muted">
                      {m.calories} · {m.proteinG}g
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {shown.couldMake.length > 0 && (
            <Section title="You could also make">
              <ul className="space-y-1.5">
                {shown.couldMake.map((r) => (
                  <li key={r.title} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0">{r.title}</span>
                    <span className="shrink-0 text-[12px] tabular text-muted">
                      {r.calories} · {r.proteinG}g
                      {r.prepMinutes !== null && ` · ${r.prepMinutes}m`}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </>
  );
}

const Macro = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex-1 px-3 text-center first:pl-0 last:pr-0">
    <p className="text-[17px] font-semibold tabular">{value}</p>
    <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card p-5">
    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-faint">{title}</h3>
    {children}
  </section>
);
