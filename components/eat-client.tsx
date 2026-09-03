"use client";

import { TodayFood } from "./today-food";
import { CalorieCalculator } from "./calorie-calculator";
import type { DayFoodView, MealWeekView, RecentMeal } from "@/lib/views";
import { MealRow } from "./meal-row";

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
  day, usuals, planned, calorieTarget, proteinTargetG, foodUnits,
}: {
  day: DayFoodView;
  usuals: RecentMeal[];
  planned: Meal[];
  calorieTarget: number | null;
  proteinTargetG: number | null;
  foodUnits: "metric" | "imperial";
}) {
  return (
    <div className="space-y-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0 xl:[&>*]:mb-3">
      {/* The day's log is the point of the screen and the widest thing on it —
          it takes the whole row rather than sharing one. */}
      <div className="xl:col-span-2">
        <TodayFood day={day} usuals={usuals} />
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Planned for today</h2>
          {calorieTarget !== null && (
            <p className="shrink-0 text-[12px] text-faint tabular">
              {calorieTarget} kcal · {proteinTargetG}g protein
            </p>
          )}
        </div>
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
      </section>

      <CalorieCalculator calorieTarget={calorieTarget} foodUnits={foodUnits} />
    </div>
  );
}
