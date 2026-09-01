"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";

type Lookup = {
  found: boolean;
  source?: "library" | "estimated";
  food?: string;
  grams?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  assumed100g?: boolean;
  alternatives?: string[];
  note?: string;
  error?: string;
};

type Item = { label: string; grams: number; kcal: number; proteinG: number; estimated: boolean };

/**
 * "100g boiled egg" in, calories out.
 *
 * The library answers instantly and for free; anything it doesn't carry falls
 * through to an estimate that costs a fraction of a cent. Which one answered is
 * shown, because an estimate deserves less trust than a reference value and she
 * should be able to tell them apart.
 */
export function CalorieCalculator({ calorieTarget }: { calorieTarget: number | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Lookup | null>(null);
  const [basket, setBasket] = useState<Item[]>([]);
  const [logging, setLogging] = useState(false);

  const totals = basket.reduce(
    (acc, i) => ({ kcal: acc.kcal + i.kcal, protein: acc.protein + i.proteinG }),
    { kcal: 0, protein: 0 },
  );

  async function look() {
    if (!query.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await action<Lookup>("lookup_food", { query: query.trim() }));
    } catch {
      setResult({ found: false, error: "Couldn't look that up." });
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!result?.found || result.kcal === undefined) return;
    setBasket((b) => [...b, {
      label: `${result.grams}g ${result.food}`,
      grams: result.grams ?? 0,
      kcal: result.kcal ?? 0,
      proteinG: result.proteinG ?? 0,
      estimated: result.source === "estimated",
    }]);
    setResult(null);
    setQuery("");
  }

  async function logIt(slot: "breakfast" | "lunch" | "dinner" | "snack") {
    if (basket.length === 0) return;
    setLogging(true);
    try {
      await action("log_meal", {
        slot,
        description: basket.map((i) => i.label).join(", "),
        calories: Math.round(totals.kcal),
        proteinG: Math.round(totals.protein),
      });
      setBasket([]);
      router.refresh();
    } finally {
      setLogging(false);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <h2 className="mb-1 text-[15px] font-semibold">Calorie calculator</h2>
      <p className="mb-3 text-[12px] text-faint">
        Type a food and a portion — &ldquo;100g boiled egg&rdquo;, &ldquo;2 eggs&rdquo;, &ldquo;4oz salmon&rdquo;.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); void look(); }} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="100g chicken breast"
          enterKeyHint="search"
          className="min-w-0 flex-1 rounded-xl border border-line bg-base px-4 py-3 text-[16px] placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="shrink-0 rounded-xl bg-accent px-4 text-[14px] font-semibold text-ink disabled:opacity-40"
        >
          {busy ? "…" : "Look up"}
        </button>
      </form>

      {result && (
        <div className="mt-3 rounded-xl border border-line bg-raised p-3.5">
          {result.found ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[15px] font-medium">
                  {result.grams}g {result.food}
                </p>
                <p className="shrink-0 text-[19px] font-bold tabular text-accent">
                  {result.kcal} <span className="text-[12px] font-normal text-faint">kcal</span>
                </p>
              </div>
              <p className="mt-1 text-[12px] text-muted tabular">
                {result.proteinG}g protein · {result.carbsG}g carbs · {result.fatG}g fat
              </p>

              {result.assumed100g && (
                <p className="mt-2 text-[11px] text-faint">
                  No amount given, so that&apos;s per 100g.
                </p>
              )}
              {result.source === "estimated" && (
                <p className="mt-2 text-[11px] text-hold">
                  Estimated — not from the library, so treat it as approximate.
                  {result.note ? ` ${result.note}` : ""}
                </p>
              )}
              {result.alternatives && result.alternatives.length > 0 && (
                <p className="mt-2 text-[11px] text-faint">
                  Also matched: {result.alternatives.join(", ")}
                </p>
              )}

              <button
                onClick={add}
                className="mt-3 w-full rounded-lg border border-line py-2 text-[13px] text-accent"
              >
                Add to this meal
              </button>
            </>
          ) : (
            <p className="text-[13px] text-muted">{result.error}</p>
          )}
        </div>
      )}

      {basket.length > 0 && (
        <div className="mt-4">
          <ul className="space-y-1.5">
            {basket.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-muted">
                  {item.label}
                  {item.estimated && <span className="ml-1 text-[10px] text-hold">est</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2 tabular">
                  <span>{Math.round(item.kcal)}</span>
                  <button
                    onClick={() => setBasket((b) => b.filter((_, j) => j !== i))}
                    aria-label={`Remove ${item.label}`}
                    className="text-faint"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-[13px] text-muted">
              {Math.round(totals.protein)}g protein
              {calorieTarget && (
                <span className="ml-2 text-faint">
                  {Math.round((totals.kcal / calorieTarget) * 100)}% of today&apos;s target
                </span>
              )}
            </span>
            <span className="text-xl font-bold tabular text-accent">{Math.round(totals.kcal)}</span>
          </div>

          <p className="mb-2 mt-3 text-[11px] uppercase tracking-wide text-faint">Log it as</p>
          <div className="grid grid-cols-4 gap-1.5">
            {(["breakfast", "lunch", "dinner", "snack"] as const).map((slot) => (
              <button
                key={slot}
                onClick={() => logIt(slot)}
                disabled={logging}
                className="rounded-lg border border-line bg-raised py-2 text-[11px] capitalize text-muted active:bg-line disabled:opacity-40"
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
