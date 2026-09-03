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
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium uppercase tracking-wide text-accent">{prettyDate(her)}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">Eat</h1>
        </div>
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
