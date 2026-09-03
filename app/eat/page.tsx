import { EatClient } from "@/components/eat-client";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { dayFoodView, mealWeekView, recentMeals } from "@/lib/views";
import { prettyDate, weekStart } from "@/lib/date";
import { profileToday } from "@/lib/profile";
import { foodUnitsOf } from "@/lib/food-units";

export const dynamic = "force-dynamic";

/**
 * Today's food, the way Train is today's training.
 *
 * Eating was a column on the Plan screen, which made the thing she does three
 * times a day a sub-section of a weekly document. The two active screens are
 * now the two things happening today — train and eat — and Plan is what those
 * distil into over a week.
 */
export default async function EatPage() {
  const profile = await requireOnboarded();
  // Her day, not the server's: a 7pm dinner must not land on tomorrow.
  const her = profileToday(profile);

  const [dayFood, mealWeek, usuals] = await Promise.all([
    dayFoodView(profile.id, her),
    mealWeekView(profile.id, foodUnitsOf(profile), weekStart(her), her),
    recentMeals(profile.id, { from: her }),
  ]);

  const today = mealWeek.days.find((d) => d.dayOfWeek === mealWeek.todayIndex) ?? null;

  return (
    <>
      {/*
        The date is the heading. "Eat" was the tab she tapped to get here and
        the word above it in the nav — repeating it at the top of the screen
        told her nothing she had not just been told twice, and pushed the only
        useful line, the day, into a caption above it.
      */}
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <h1 className="truncate text-2xl font-bold tracking-tight">{prettyDate(her)}</h1>
        <AiOpinion page="plan" label="food" />
      </header>

      <EatClient
        day={dayFood}
        usuals={usuals}
        planned={today?.meals ?? []}
        calorieTarget={mealWeek.exists ? mealWeek.calorieTarget : null}
        proteinTargetG={mealWeek.exists ? mealWeek.proteinTargetG : null}
        foodUnits={mealWeek.foodUnits}
      />
    </>
  );
}
