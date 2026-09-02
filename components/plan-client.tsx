"use client";

import { useState } from "react";
import Link from "next/link";
import type { DayFoodView, MealWeekView, PantryView, RecentMeal, WeekView } from "@/lib/views";
import { CalorieCalculator } from "./calorie-calculator";
import { TodayFood } from "./today-food";
import { Ideas, type MealIdea, type MoveIdea } from "./ideas";
import { ShoppingList, type ShoppingAisle } from "./shopping-list";
import { Kitchen } from "./kitchen";
import { action, actionMessage } from "@/lib/client";
import { AskCoach } from "./ask-coach";

export function PlanClient({
  week, mealWeek, dayFood, usuals, initialMeals, initialMoves, shopping, instacart, pantry,
}: {
  week: WeekView; mealWeek: MealWeekView; dayFood: DayFoodView; usuals: RecentMeal[];
  initialMeals: MealIdea[]; initialMoves: MoveIdea[]; shopping: ShoppingAisle[]; instacart: boolean;
  pantry: PantryView;
}) {
  const [tab, setTab] = useState<"training" | "meals" | "ideas">("training");
  const [openDay, setOpenDay] = useState<number | null>(week.todayIndex);

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-full border border-line bg-surface p-1">
        {(["training", "meals", "ideas"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full py-2 text-[13px] font-medium capitalize transition-colors ${
              tab === t ? "bg-accent text-ink" : "text-muted"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "ideas" ? (
        <Ideas week={week} mealWeek={mealWeek} initialMeals={initialMeals} initialMoves={initialMoves} />
      ) : tab === "training" ? (
        week.exists ? (
          <div className="space-y-2">
            {week.rationale && (
              <p className="card mb-3 p-4 text-[13px] leading-relaxed text-muted">{week.rationale}</p>
            )}
            {week.days.map((d) => (
              <DayRow
                key={d.dayOfWeek}
                open={openDay === d.dayOfWeek}
                onToggle={() => setOpenDay(openDay === d.dayOfWeek ? null : d.dayOfWeek)}
                isToday={d.dayOfWeek === week.todayIndex}
                dayName={d.dayName}
                title={d.title}
                meta={d.isRest ? "Rest" : `${d.exercises.length} exercises`}
                dim={d.isRest}
              >
                {d.notes && <p className="mb-2 text-[13px] italic text-faint">{d.notes}</p>}
                {d.exercises.map((e) => (
                  <Link key={e.slug} href={`/learn/${e.slug}`}
                    className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2.5 last:border-0">
                    <span className="text-[15px]">{e.name}</span>
                    <span className="shrink-0 text-[13px] text-muted tabular">{e.target}</span>
                  </Link>
                ))}
              </DayRow>
            ))}
          </div>
        ) : (
          <>
          <Empty body="No training plan for this week yet. Ask your coach to build one." />
          <AskCoach
            title="Ask your coach"
            hint="It builds the week here"
            placeholder="Tell your coach what you want…"
            suggestions={[
              "Build my week",
              "I've only got three days this week",
              "Give me something short I can do at home",
            ]}
          />
          </>
        )
      ) : mealWeek.exists ? (
        <div className="space-y-2">
          <TodayFood day={dayFood} usuals={usuals} />
          <CalorieCalculator calorieTarget={mealWeek.calorieTarget} foodUnits={mealWeek.foodUnits} />

          <div className="card mb-3 flex divide-x divide-line p-4">
            <Stat label="Daily calories" value={mealWeek.calorieTarget.toString()} />
            <Stat label="Protein" value={`${mealWeek.proteinTargetG}g`} />
          </div>
          <ShoppingList weekStart={mealWeek.weekStart} aisles={shopping} instacart={instacart} />
          <Kitchen pantry={pantry} />

          {mealWeek.rationale && (
            <p className="card mb-3 p-4 text-[13px] leading-relaxed text-muted">{mealWeek.rationale}</p>
          )}
          {mealWeek.days.map((d) => (
            <DayRow
              key={d.dayOfWeek}
              open={openDay === d.dayOfWeek}
              onToggle={() => setOpenDay(openDay === d.dayOfWeek ? null : d.dayOfWeek)}
              isToday={d.dayOfWeek === mealWeek.todayIndex}
              dayName={d.dayName}
              title={d.meals.length ? `${d.calories} kcal` : "Nothing planned"}
              meta={d.meals.length ? `${d.proteinG}g protein` : ""}
              dim={d.meals.length === 0}
            >
              {d.meals.map((m) => <MealRow key={m.id} meal={m} />)}
            </DayRow>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <TodayFood day={dayFood} usuals={usuals} />
          <CalorieCalculator calorieTarget={null} foodUnits={mealWeek.foodUnits} />
          <Kitchen pantry={pantry} />
          <Empty body="No meal plan for this week yet. Ask your coach to put one together." />
          <AskCoach
            title="Ask your coach"
            hint="It writes the week here"
            placeholder="Tell your coach what you want…"
            suggestions={[
              "Plan my meals for this week",
              "Keep it simple, I don't want to cook much",
              "What should I eat today?",
            ]}
          />
        </div>
      )}
    </>
  );
}

type Meal = MealWeekView["days"][number]["meals"][number];
type Recipe = { ingredients: string[]; steps: string[]; prepMinutes: number | null };

function MealRow({ meal }: { meal: Meal }) {
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

function DayRow({
  open, onToggle, isToday, dayName, title, meta, dim, children,
}: {
  open: boolean; onToggle: () => void; isToday: boolean;
  dayName: string; title: string; meta: string; dim?: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`card overflow-hidden ${isToday ? "border-accent/50" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div className={`w-11 shrink-0 text-[11px] font-semibold uppercase tracking-wide ${isToday ? "text-accent" : "text-faint"}`}>
          {dayName.slice(0, 3)}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] font-medium ${dim ? "text-muted" : ""}`}>{title}</p>
          {meta && <p className="text-[12px] text-faint">{meta}</p>}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="border-t border-line px-4 py-2">{children}</div>}
    </section>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex-1 px-4 first:pl-0 last:pr-0">
    <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
    <p className="text-xl font-semibold tabular">{value}</p>
  </div>
);

const Empty = ({ body }: { body: string }) => (
  <div className="card mt-6 mb-3 p-8 text-center">
    <p className="mx-auto max-w-xs text-sm text-muted">{body}</p>
  </div>
);
