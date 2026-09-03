"use client";

import { useState } from "react";
import { action, actionMessage } from "@/lib/client";
import type { MealWeekView } from "@/lib/views";

/**
 * One planned meal, opening to its recipe.
 *
 * Shared by the week's plan and today's food screen — the same row in two
 * places rather than two rows that drift apart. A meal the planner left
 * without a recipe gets one written the first time she opens it, and the tool
 * saves it onto the meal with a conditional update, so this asks once and
 * never again.
 */
type Meal = MealWeekView["days"][number]["meals"][number];
type Recipe = { ingredients: string[]; steps: string[]; prepMinutes: number | null };

export function MealRow({ meal }: { meal: Meal }) {
  const [open, setOpen] = useState(false);
  // A meal the week planner left without a recipe. Rather than showing her an
  // empty panel, the coach writes one the first time she opens it — and the
  // tool saves it onto the meal, so this asks once and never again.
  const [recipe, setRecipe] = useState<Recipe | null>(
    // Both halves, or it is not something she can cook from — the same test
    // the tool applies before it writes one.
    meal.ingredients.length > 0 && meal.steps.length > 0
      ? { ingredients: meal.ingredients, steps: meal.steps, prepMinutes: meal.prepMinutes }
      : null,
  );
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    const next = !open;
    setOpen(next);
    if (!next || recipe || writing) return;
    setWriting(true);
    setError(null);
    try {
      const r = await action<Recipe>("get_meal_recipe", { mealId: meal.id });
      setRecipe({ ingredients: r.ingredients, steps: r.steps, prepMinutes: r.prepMinutes });
    } catch (err) {
      setError(actionMessage(err, "Couldn't write that recipe — try again."));
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="border-b border-line/60 py-2.5 last:border-0">
      <button onClick={reveal} className="flex w-full items-baseline justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="mr-2 text-[11px] uppercase tracking-wide text-accent">{meal.slot}</span>
          <span className="text-[15px]">{meal.title}</span>
        </span>
        <span className="shrink-0 text-[13px] text-muted tabular">{meal.calories} · {meal.proteinG}g</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-[13px] text-muted">
          {recipe?.prepMinutes !== null && recipe?.prepMinutes !== undefined && (
            <p className="text-faint">{recipe.prepMinutes} min prep</p>
          )}

          {writing && (
            <p className="flex items-center gap-2 text-faint">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              Your coach is writing the recipe…
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-miss/40 bg-miss-soft px-2.5 py-1.5 text-miss">{error}</p>
          )}

          {recipe && recipe.ingredients.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">Ingredients</p>
              <ul className="space-y-0.5">{recipe.ingredients.map((x, i) => <li key={i}>· {x}</li>)}</ul>
            </div>
          )}
          {recipe && recipe.steps.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">Method</p>
              <ol className="space-y-1">
                {recipe.steps.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent tabular">{i + 1}.</span><span>{x}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
