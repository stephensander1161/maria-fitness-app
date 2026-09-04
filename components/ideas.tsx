"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import type { MealWeekView, WeekView } from "@/lib/views";
import { ExerciseFigure } from "./exercise-figure";

export type MealIdea = {
  title: string; slot: string; calories: number; proteinG: number;
  carbsG: number | null; fatG: number | null; prepMinutes: number | null;
  ingredients: string[]; steps: string[];
};
export type MoveIdea = {
  slug: string; name: string; category: string;
  primaryMuscles: string[]; equipment: string[];
  bodyweight: boolean; tags: string[]; safetyNote: string | null;
};

type Kind = "meals" | "movements" | "stretches";

const KINDS: { key: Kind; label: string }[] = [
  { key: "meals", label: "Meals" },
  { key: "movements", label: "Movements" },
  { key: "stretches", label: "Stretches" },
];

/**
 * Somewhere to look at options without them becoming hers.
 *
 * Everything else in the app is either her committed plan or a conversation.
 * This is the third thing: browsing. It draws from the seeded libraries rather
 * than a model, so shuffling is instant and free — which matters, because the
 * whole point is pressing it again.
 *
 * Adopting an idea goes back through swap_meal and add_exercise_to_day, so
 * there is still exactly one write path. Nothing here writes anything until
 * she picks a day.
 */
export function Ideas({
  week, mealWeek, initialMeals, initialMoves,
}: {
  week: WeekView; mealWeek: MealWeekView;
  initialMeals: MealIdea[]; initialMoves: MoveIdea[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("meals");
  // Seeded from the server so the tab has something in it the moment she opens
  // it, rather than flashing empty while a fetch lands.
  const [meals, setMeals] = useState<MealIdea[]>(initialMeals);
  const [moves, setMoves] = useState<MoveIdea[]>(initialMoves);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shuffle = useCallback(async (which: Kind) => {
    setBusy(true);
    setError(null);
    try {
      if (which === "meals") {
        const r = await action<{ ideas: MealIdea[] }>("suggest_meals", { limit: 6 });
        setMeals(r.ideas);
      } else {
        const r = await action<{ ideas: MoveIdea[] }>("suggest_exercises", {
          ...(which === "stretches" ? { category: "mobility" } : {}),
          limit: 6,
        });
        setMoves(r.ideas);
      }
    } catch (err) {
      setError(actionMessage(err, "Couldn't fetch ideas — try again."));
    } finally {
      setBusy(false);
    }
  }, []);

  // Switching between movements and stretches is a different question, so it
  // re-rolls; switching back to meals is not, so it does not.
  function choose(next: Kind) {
    setKind(next);
    if (next !== "meals" && next !== kind) void shuffle(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full border border-line bg-surface p-1">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => choose(k.key)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                kind === k.key ? "bg-accent text-on-accent" : "text-muted"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void shuffle(kind)}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-accent active:bg-raised disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
          {busy ? "…" : "Shuffle"}
        </button>
      </div>

      <p className="text-[12px] leading-relaxed text-faint">
        {kind === "meals"
          ? "Meals you could eat, already filtered to what you will and won't eat. Nothing changes until you pick a day."
          : kind === "stretches"
            ? "Stretches and physio work you can do with what you have. Tap for the form notes."
            : "Movements you can actually perform with your equipment."}
      </p>

      {error && <p role="alert" className="text-[13px] text-miss">{error}</p>}

      {kind === "meals"
        ? meals.map((m, i) => (
            <MealCard key={`${m.title}-${i}`} idea={m} mealWeek={mealWeek} onDone={() => router.refresh()} />
          ))
        : moves.map((m) => (
            <MoveCard key={m.slug} idea={m} week={week} onDone={() => router.refresh()} />
          ))}

      {!busy && (kind === "meals" ? meals.length === 0 : moves.length === 0) && (
        <p className="card p-4 text-[13px] text-faint">
          Nothing to suggest with your current restrictions and equipment. Ask your coach and it can widen the net.
        </p>
      )}
    </div>
  );
}

function MealCard({
  idea, mealWeek, onDone,
}: { idea: MealIdea; mealWeek: MealWeekView; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only the same slot: offering to put a breakfast into Thursday dinner is a
  // worse suggestion than not offering at all.
  const targets = mealWeek.days.flatMap((d) =>
    d.meals.filter((m) => m.slot === idea.slot).map((m) => ({ ...m, dayName: d.dayName })),
  );

  async function use(mealId: string) {
    setSaving(mealId);
    setError(null);
    try {
      await action("swap_meal", {
        mealId, title: idea.title, calories: idea.calories, proteinG: idea.proteinG,
        ...(idea.carbsG !== null && { carbsG: idea.carbsG }),
        ...(idea.fatG !== null && { fatG: idea.fatG }),
        ingredients: idea.ingredients, steps: idea.steps,
        ...(idea.prepMinutes !== null && { prepMinutes: idea.prepMinutes }),
      });
      setPicking(false);
      onDone();
    } catch (err) {
      setError(actionMessage(err, "That didn't swap — try again."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="card p-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="mr-2 text-[11px] uppercase tracking-wide text-accent">{idea.slot}</span>
          <span className="text-[15px]">{idea.title}</span>
        </span>
        <span className="shrink-0 text-[12px] tabular text-muted">
          {idea.calories} · {idea.proteinG}g
        </span>
      </button>

      <p className="mt-1 text-[11px] text-faint tabular">
        {idea.prepMinutes ? `${idea.prepMinutes} min · ` : ""}
        {idea.ingredients.length} ingredients
      </p>

      {open && (
        <div className="mt-2.5 space-y-2 text-[12px] text-muted">
          <p>{idea.ingredients.join(" · ")}</p>
          <ol className="space-y-1">
            {idea.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="tabular text-accent">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {targets.length > 0 && (
        <div className="mt-3">
          {!picking ? (
            <button
              onClick={() => setPicking(true)}
              className="w-full rounded-lg border border-line py-2 text-[13px] text-accent"
            >
              Put this in my week
            </button>
          ) : (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">
                Replace which {idea.slot}?
              </p>
              <div className="space-y-1">
                {targets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => void use(t.id)}
                    disabled={saving !== null}
                    className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left text-[13px] active:bg-raised disabled:opacity-40"
                  >
                    <span className="min-w-0">
                      <span className="text-muted">{t.dayName}</span>
                      <span className="ml-2 truncate text-faint">{t.title}</span>
                    </span>
                    <span className="shrink-0 tabular text-faint">{t.calories}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setPicking(false)} className="mt-2 w-full py-1.5 text-[12px] text-faint">
                Cancel
              </button>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
        </div>
      )}
    </div>
  );
}

function MoveCard({ idea, week, onDone }: { idea: MoveIdea; week: WeekView; onDone: () => void }) {
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(dayOfWeek: number) {
    setSaving(dayOfWeek);
    setError(null);
    try {
      // Sensible starting numbers; she adjusts them on the Train screen the
      // same as any other exercise.
      await action("add_exercise_to_day", { slug: idea.slug, sets: 3, reps: 10, dayOfWeek });
      setPicking(false);
      onDone();
    } catch (err) {
      setError(actionMessage(err, "That didn't get added — try again."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <ExerciseFigure slug={idea.slug} category={idea.category} className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px]">{idea.name}</p>
          <p className="mt-0.5 text-[11px] text-faint">
            {idea.primaryMuscles.slice(0, 3).join(", ")}
            {idea.bodyweight ? " · bodyweight" : ""}
          </p>
        </div>
      </div>

      {idea.safetyNote && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted">{idea.safetyNote}</p>
      )}

      <div className="mt-3">
        {!picking ? (
          <button
            onClick={() => setPicking(true)}
            className="w-full rounded-lg border border-line py-2 text-[13px] text-accent"
          >
            Add to a day
          </button>
        ) : (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Which day?</p>
            <div className="grid grid-cols-4 gap-1.5">
              {week.days.map((d) => (
                <button
                  key={d.dayOfWeek}
                  onClick={() => void add(d.dayOfWeek)}
                  disabled={saving !== null}
                  className={`rounded-lg border py-2 text-[12px] active:bg-raised disabled:opacity-40 ${
                    d.isRest ? "border-line text-faint" : "border-line text-muted"
                  }`}
                >
                  {d.dayName.slice(0, 3)}
                  {d.isRest && <span className="block text-[9px] text-faint">rest</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setPicking(false)} className="mt-2 w-full py-1.5 text-[12px] text-faint">
              Cancel
            </button>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
      </div>
    </div>
  );
}
