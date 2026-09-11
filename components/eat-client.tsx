"use client";

import { TodayFood } from "./today-food";
import { CalorieCalculator } from "./calorie-calculator";
import type { DayFoodView, MealWeekView, SavedMeal } from "@/lib/views";
import type { MacroRow } from "@/lib/macro-progress";
import { MealRow } from "./meal-row";
import { RecipeScan } from "./recipe-scan";
import { BurnCard } from "./burn-card";
import { FoldableCard } from "./foldable-card";
import { AteThePlan } from "./ate-the-plan";

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
  burnKcal, burnSessions, isToday, water,
}: {
  /** Water as the sixth macro, plus the vessels that fill it. */
  water: {
    row: MacroRow;
    presets: { ml: number; label: string }[];
    anythingLogged: boolean;
  };
  /** Whether the day on screen is her today. "Planned for today" over
   *  Thursday is the kind of wrong that only gets noticed after it is
   *  believed — the screen steps back a day at a time now. */
  isToday: boolean;
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
  /** What the day's training is estimated to have cost. Never an allowance. */
  burnKcal: number;
  burnSessions: number;
}) {
  /*
    Which meals of the day already have something in them.

    By slot, matching the tool: a meal she typed in herself carries no planned
    meal id, so counting by id offered to log a breakfast that was already in
    her log — and then did.
  */
  const takenSlots = new Set(day.logged.map((l) => l.slot));
  // …and which planned meals are down as themselves, for the row's own tick.
  // A meal she typed by hand has no id, so this marks fewer rows than are
  // really eaten rather than more — the direction that leaves a button she
  // can still press.
  const loggedMealIds = new Set(day.logged.map((l) => l.mealId).filter(Boolean));
  return (
    <div className="space-y-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0 xl:[&>*]:mb-3">
      {/* The day's log is the point of the screen and the widest thing on it —
          it takes the whole row rather than sharing one. */}
      <div className="xl:col-span-2">
        <TodayFood day={day} saved={saved} isToday={isToday} water={water} />
      </div>

      {/* Folds away, and stays folded — on the account, so it follows her to
          a laptop. Open by default: what the card holds is what teaches her it
          is worth having. */}
      <FoldableCard
        id="plannedFood"
        title={isToday ? "Planned for today" : "Planned for that day"}
        startOpen={plannedOpen}
        // A column beside another one with room to spare: folding it here
        // saves nothing and only hides something.
        alwaysOpenOnDesktop
        aside={calorieTarget !== null ? (
          <p className="shrink-0 text-[12px] text-faint tabular">
            {calorieTarget} kcal · {proteinTargetG}g protein
          </p>
        ) : null}
      >
        {planned.length > 0 ? (
          <div>
            {planned.map((m) => (
              <MealRow
                key={m.id}
                meal={m}
                ateOn={day.date}
                logged={loggedMealIds.has(m.id)}
              />
            ))}
            {/* One small line, not a card. Each row has its own "Ate it" and
                three taps is not a hardship — this is only here for the day
                she wants all of them at once. */}
            <AteThePlan
              date={day.date}
              remaining={planned.filter((m) => !takenSlots.has(m.slot)).length}
            />
          </div>
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

      {/*
        Beside the calculator on a wide screen rather than alone under
        everything — two short cards that were each taking a whole row.

        Still below the food, and still never beside the intake total: the
        moment a burn figure sits next to what she has eaten, people start
        subtracting one from the other, and this app's expenditure number
        already contains her training.
      */}
      <BurnCard
        title={isToday ? "Training today" : "Training that day"}
        kcal={burnKcal}
        sub="burned"
        sessions={burnSessions}
      />
    </div>
  );
}
