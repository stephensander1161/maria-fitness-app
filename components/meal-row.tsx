"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { MealPicker } from "./meal-picker";
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

export function MealRow({ meal, dayOfWeek }: { meal: Meal; dayOfWeek?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /**
   * Changing what is planned, where it is planned.
   *
   * The coach could always swap a meal, and does it well — but "not that on
   * Thursday" is a decision she usually wants to make with her eyes, and the
   * screen that showed her the week had no way to act on it. Only offered
   * where the day is known: the same row appears on the Eat screen, where the
   * question is what she *ate*, not what was planned.
   */
  const [swapping, setSwapping] = useState(false);
  const [removing, setRemoving] = useState(false);
  /**
   * The recipe on screen, which has to be the recipe of the meal on screen.
   *
   * Both halves, or it is not something she can cook from — the same test the
   * tool applies before it writes one. Written recipes are held against the
   * meal they were written for: swapping a meal keeps the same row and the
   * same id, so a recipe seeded once into state stayed on screen describing
   * the breakfast she had just replaced.
   */
  const fromPlan: Recipe | null =
    meal.ingredients.length > 0 && meal.steps.length > 0
      ? { ingredients: meal.ingredients, steps: meal.steps, prepMinutes: meal.prepMinutes }
      : null;
  const signature = `${meal.id}::${meal.title}`;
  const [written, setWritten] = useState<{ for: string; recipe: Recipe } | null>(null);
  const recipe = written?.for === signature ? written.recipe : fromPlan;
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
      setWritten({
        for: signature,
        recipe: { ingredients: r.ingredients, steps: r.steps, prepMinutes: r.prepMinutes },
      });
    } catch (err) {
      setError(actionMessage(err, "Couldn't write that recipe — try again."));
    } finally {
      setWriting(false);
    }
  };

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      await action("remove_planned_meal", { mealId: meal.id });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "Couldn't take that off the day."));
      setRemoving(false);
    }
  }

  return (
    <div className="border-b border-line/60 py-2.5 last:border-0">
      <div className="flex items-baseline gap-2">
        <button onClick={reveal} className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="mr-2 text-[11px] uppercase tracking-wide text-accent">{meal.slot}</span>
            <span className="text-[15px]">{meal.title}</span>
          </span>
          <span className="shrink-0 text-[13px] text-muted tabular">{meal.calories} · {meal.proteinG}g</span>
        </button>
        {dayOfWeek !== undefined && (
          <>
            <button
              onClick={() => setSwapping(!swapping)}
              aria-expanded={swapping}
              aria-label={`Change ${meal.title}`}
              className={`-my-1 grid size-7 shrink-0 place-items-center rounded-full transition-colors ${
                swapping ? "bg-accent-soft text-accent" : "text-faint hover:bg-raised hover:text-muted"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 8h13l-3-3M20 16H7l3 3" />
              </svg>
            </button>
            <button
              onClick={remove}
              disabled={removing}
              aria-label={`Take ${meal.title} off the day`}
              className="-my-1 grid size-7 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-raised hover:text-miss disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M5 12h14" strokeLinecap="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {swapping && dayOfWeek !== undefined && (
        <MealPicker
          slot={meal.slot}
          dayOfWeek={dayOfWeek}
          replacing={meal.id}
          nearCalories={meal.calories}
          onClose={() => setSwapping(false)}
        />
      )}
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
