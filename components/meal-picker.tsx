"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * Change what is planned for a slot, by looking at the options.
 *
 * The coach could always do this and did it well — but "swap Thursday's
 * dinner" is a decision she often wants to make with her eyes, the same way
 * she picks a movement. So: the same shape as the movement picker, drawing on
 * the same recipe library the planner does, filtered to her restrictions and
 * dislikes before it ever reaches the screen.
 *
 * It writes through swap_meal / add_planned_meal / remove_planned_meal like
 * everything else. There is no second write path, and the day's totals come
 * back from the server rather than being added up here — a number this screen
 * computed for itself is a number that can disagree with the one the coach
 * reads.
 */
export type MealIdeaOption = {
  title: string; slot: string;
  calories: number; proteinG: number;
  carbsG?: number | null; fatG?: number | null; prepMinutes?: number | null;
  ingredients: string[]; steps: string[];
};

export function MealPicker({
  slot, dayOfWeek, replacing, nearCalories, onClose,
}: {
  slot: string;
  dayOfWeek: number;
  /** The meal being replaced, or null when adding a new one to the slot. */
  replacing: string | null;
  nearCalories: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [ideas, setIdeas] = useState<MealIdeaOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await action<{ ideas: MealIdeaOption[] }>("suggest_meals", {
          slot, limit: 12, ...(nearCalories === null ? {} : { nearCalories }),
        });
        if (!cancelled) setIdeas(r.ideas ?? []);
      } catch (err) {
        if (cancelled) return;
        setIdeas([]);
        setError(actionMessage(err, "Couldn't load any ideas."));
      }
    })();
    return () => { cancelled = true; };
  }, [slot, nearCalories]);

  async function choose(idea: MealIdeaOption) {
    setBusy(idea.title);
    setError(null);
    const payload = {
      title: idea.title,
      calories: idea.calories,
      proteinG: idea.proteinG,
      ...(idea.carbsG === null || idea.carbsG === undefined ? {} : { carbsG: idea.carbsG }),
      ...(idea.fatG === null || idea.fatG === undefined ? {} : { fatG: idea.fatG }),
      ...(idea.prepMinutes === null || idea.prepMinutes === undefined ? {} : { prepMinutes: idea.prepMinutes }),
      ingredients: idea.ingredients,
      steps: idea.steps,
    };
    try {
      if (replacing) await action("swap_meal", { mealId: replacing, ...payload });
      else await action("add_planned_meal", { dayOfWeek, slot, ...payload });
      onClose();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-line bg-raised p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[12px] uppercase tracking-wide text-faint">
          {replacing ? "Swap for" : `Add a ${slot}`}
        </p>
        <button onClick={onClose} className="-my-1 px-2 py-1 text-[12px] text-muted">Cancel</button>
      </div>

      {ideas === null && <p className="py-3 text-center text-[13px] text-faint">Finding something…</p>}

      {ideas !== null && ideas.length === 0 && (
        <p className="py-3 text-[13px] leading-relaxed text-faint">
          Nothing in the library fits your restrictions for this slot. Ask your coach — it can
          write one from scratch.
        </p>
      )}

      {ideas !== null && ideas.length > 0 && (
        <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
          {ideas.map((i) => (
            <button
              key={i.title}
              onClick={() => void choose(i)}
              disabled={busy !== null}
              className="rounded-xl border border-line bg-base p-3 text-left transition-colors hover:bg-raised disabled:opacity-40"
            >
              <p className="text-[14px] font-medium leading-tight">{i.title}</p>
              <p className="mt-1 text-[12px] text-muted tabular">
                {i.calories} kcal · {i.proteinG}g protein
                {i.prepMinutes ? ` · ${i.prepMinutes} min` : ""}
              </p>
              {busy === i.title && <p className="mt-1 text-[11px] text-accent">Saving…</p>}
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
    </div>
  );
}
