"use client";

import { TodayFood } from "./today-food";
import { CalorieCalculator } from "./calorie-calculator";
import type { DayFoodView, MealWeekView, SavedMeal } from "@/lib/views";
import { MealRow } from "./meal-row";
import { RecipeScan } from "./recipe-scan";
import { FoldableCard } from "./foldable-card";

type Meal = MealWeekView["days"][number]["meals"][number];

/**
 * Today's eating: what she has had, what was planned, and a way to work out
 * anything that is neither.
 *
 * Ordered by what she is standing there wanting to do. Logging comes first —
 * it is the thing with a deadline, because a meal not written down within the
 * hour is a meal that never gets written down. What was planned comes second,
 * as a prompt rather than an instruction; she can log one with a tap.
 */
export function EatClient({
  day, saved, planned, calorieTarget, proteinTargetG, foodUnits, defaultSlot, plannedOpen,
}: {
  day: DayFoodView;
  /** Her regulars, for one-tap logging. */
  saved: SavedMeal[];
  planned: Meal[];
  calorieTarget: number | null;
  proteinTargetG: number | null;
  foodUnits: "metric" | "imperial";
  /** The meal she is most likely logging right now, from the hour where she is. */
  defaultSlot: "breakfast" | "lunch" | "dinner" | "snack";
  /** Whether she has folded the planned-meals card away — see lib/cards.ts. */
  plannedOpen: boolean;
}) {
  return (
    <div className="space-y-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0 xl:[&>*]:mb-3">
      {/* The day's log is the point of the screen and the widest thing on it —
          it takes the whole row rather than sharing one. */}
      <div className="xl:col-span-2">
        <TodayFood day={day} saved={saved} />
      </div>

      {/* Folds away, and stays folded — on the account, so it follows her to
          a laptop. Open by default: what the card holds is what teaches her it
          is worth having. */}
      <FoldableCard
        id="plannedFood"
        title="Planned for today"
        startOpen={plannedOpen}
        aside={calorieTarget !== null ? (
          <p className="shrink-0 text-[12px] text-faint tabular">
            {calorieTarget} kcal · {proteinTargetG}g protein
          </p>
        ) : null}
      >
        {planned.length > 0 ? (
          <div>{planned.map((m) => <MealRow key={m.id} meal={m} />)}</div>
        ) : (
          // An empty state, not a missing card: a section that disappears is
          // indistinguishable from one that is broken.
          <p className="py-2 text-[13px] leading-relaxed text-faint">
            Nothing planned for today. That is not a problem — log what you actually eat below,
            and ask your coach for a week of meals when you want one.
          </p>
        )}
      </FoldableCard>

      <RecipeScan defaultSlot={defaultSlot} />

      <CalorieCalculator calorieTarget={calorieTarget} foodUnits={foodUnits} />
    </div>
  );
}
