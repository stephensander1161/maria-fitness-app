"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { FoodGlyph } from "./food-glyph";

type Lookup = {
  found: boolean;
  source?: "library" | "estimated";
  food?: string;
  category?: string;
  grams?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fibreG?: number | null;
  assumed100g?: boolean;
  alternatives?: string[];
  note?: string;
  error?: string;
};

type Recipe = {
  title: string; slot: string; onHerPlan: boolean;
  calories: number; proteinG: number; prepMinutes: number | null;
  ingredients: string[]; steps: string[];
};

type Item = {
  /** False when the food carried no fibre figure — not the same as zero. */
  fibreKnown: boolean;
  label: string; grams: number; kcal: number;
  proteinG: number; fibreG: number; category?: string; estimated: boolean;
};

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
  const [logError, setLogError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesFor, setRecipesFor] = useState<string | null>(null);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [openRecipe, setOpenRecipe] = useState<number | null>(null);

  async function findRecipes(ingredient: string) {
    setRecipeBusy(true);
    setOpenRecipe(null);
    try {
      const r = await action<{ recipes: Recipe[] }>("find_recipes", { ingredient });
      setRecipes(r.recipes);
      setRecipesFor(ingredient);
    } catch {
      setRecipes([]);
      setRecipesFor(ingredient);
    } finally {
      setRecipeBusy(false);
    }
  }

  const totals = basket.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.proteinG,
      fibre: acc.fibre + i.fibreG,
    }),
    { kcal: 0, protein: 0, fibre: 0 },
  );
  // Only a basket where every item has a real figure can claim a fibre total.
  // Otherwise it is a floor, and both the label and the log say so.
  const fibreComplete = basket.length > 0 && basket.every((i) => i.fibreKnown);

  async function look() {
    if (!query.trim()) return;
    setBusy(true);
    setResult(null);
    setRecipesFor(null);
    setRecipes([]);
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
      fibreG: result.fibreG ?? 0,
      fibreKnown: result.fibreG != null,
      category: result.category,
      estimated: result.source === "estimated",
    }]);
    setResult(null);
    setQuery("");
  }

  async function logIt(slot: "breakfast" | "lunch" | "dinner" | "snack") {
    if (basket.length === 0) return;
    setLogging(true);
    setLogError(null);
    try {
      await action("log_meal", {
        slot,
        description: basket.map((i) => i.label).join(", "),
        calories: Math.round(totals.kcal),
        proteinG: Math.round(totals.protein),
        // Sent only when it is the whole truth for this meal — log_meal treats
        // a missing figure as unknown, which is what it is.
        ...(fibreComplete ? { fibreG: Math.round(totals.fibre) } : {}),
      });
      setBasket([]);
      router.refresh();
    } catch (err) {
      // The basket is deliberately kept on failure: she assembled it item by
      // item, and clearing it would make her do that again.
      setLogError(actionMessage(err, "That didn't log — try again."));
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
              <div className="flex items-center gap-3">
                <FoodGlyph category={result.category} className="size-8 shrink-0 text-faint" />
                <p className="min-w-0 flex-1 truncate text-[15px] font-medium">
                  {result.grams}g {result.food}
                </p>
                <p className="shrink-0 text-[19px] font-bold tabular text-accent">
                  {result.kcal} <span className="text-[12px] font-normal text-faint">kcal</span>
                </p>
              </div>

              {/* Protein and fibre get their own line: they are the two she is
                  actually trying to hit, and burying them in a macro list makes
                  them as easy to skim past as the ones she isn't tracking. */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Macro label="Protein" value={`${result.proteinG}g`} strong />
                <Macro
                  label="Fibre"
                  value={result.fibreG === null || result.fibreG === undefined ? "—" : `${result.fibreG}g`}
                  strong
                />
              </div>
              <p className="mt-2 text-[12px] text-faint tabular">
                {result.carbsG}g carbs · {result.fatG}g fat
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

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={add}
                  className="rounded-lg border border-line py-2 text-[13px] text-accent"
                >
                  Add to this meal
                </button>
                <button
                  onClick={() => void findRecipes(result.food ?? query)}
                  disabled={recipesFor === (result.food ?? query)}
                  className="rounded-lg border border-line py-2 text-[13px] text-muted disabled:opacity-50"
                >
                  {recipeBusy ? "Looking…" : "Recipes"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-muted">{result.error}</p>
          )}
        </div>
      )}

      {recipesFor && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">
            Made with {recipesFor}
          </p>
          {recipes.length === 0 ? (
            <p className="text-[13px] text-faint">
              Nothing in your plan or the recipe library uses that. Ask your coach for an idea.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recipes.map((r, i) => (
                <li key={i} className="rounded-xl border border-line bg-raised p-3">
                  <button
                    onClick={() => setOpenRecipe(openRecipe === i ? null : i)}
                    className="flex w-full items-baseline justify-between gap-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px]">{r.title}</span>
                      <span className="text-[11px] text-faint">
                        {/* Her own plan first and marked as such — a suggestion
                            she is already scheduled to eat is a nudge back
                            toward the plan, not away from it. */}
                        {r.onHerPlan ? "on your plan · " : ""}
                        {r.slot}
                        {r.prepMinutes ? ` · ${r.prepMinutes} min` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] tabular text-muted">
                      {r.calories} · {r.proteinG}g
                    </span>
                  </button>

                  {openRecipe === i && (
                    <div className="mt-2.5 space-y-2 text-[12px] text-muted">
                      {r.ingredients.length > 0 && (
                        <p>{r.ingredients.join(" · ")}</p>
                      )}
                      <ol className="space-y-1">
                        {r.steps.map((step, j) => (
                          <li key={j} className="flex gap-2">
                            <span className="text-accent tabular">{j + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {basket.length > 0 && (
        <div className="mt-4">
          <ul className="space-y-1.5">
            {basket.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-muted">
                  <FoodGlyph category={item.category} className="size-4 shrink-0 text-faint" />
                  <span className="truncate">{item.label}</span>
                  {item.estimated && <span className="shrink-0 text-[10px] text-hold">est</span>}
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
            <span className="text-[13px] text-muted tabular">
              {Math.round(totals.protein)}g protein · {fibreComplete ? "" : "at least "}
              {Math.round(totals.fibre)}g fibre
              {calorieTarget && (
                <span className="ml-2 text-faint">
                  {Math.round((totals.kcal / calorieTarget) * 100)}% of target
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
          {logError && <p className="mt-2 text-[13px] text-miss">{logError}</p>}
        </div>
      )}
    </section>
  );
}

const Macro = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="rounded-lg bg-base px-3 py-2">
    <p className="text-[10px] uppercase tracking-wide text-faint">{label}</p>
    <p className={`tabular ${strong ? "text-[16px] font-semibold" : "text-[14px]"}`}>{value}</p>
  </div>
);
