import { EatClient } from "@/components/eat-client";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { dayFoodView, mealWeekView, savedMealsView } from "@/lib/views";
import { prettyDate, weekStart } from "@/lib/date";
import { profileToday } from "@/lib/profile";
import { BurnCard } from "@/components/burn-card";
import { burnByDay } from "@/lib/progress";
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

  const [dayFood, mealWeek, saved, burnToday] = await Promise.all([
    dayFoodView(profile.id, her),
    mealWeekView(profile.id, foodUnitsOf(profile), weekStart(her), her),
    savedMealsView(profile.id),
    burnByDay(profile.id, her, her, profile.startWeightKg ?? 70),
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
        saved={saved}
        planned={today?.meals ?? []}
        calorieTarget={mealWeek.exists ? mealWeek.calorieTarget : null}
        proteinTargetG={mealWeek.exists ? mealWeek.proteinTargetG : null}
        foodUnits={mealWeek.foodUnits}
      />

      {/*
        Below the food, deliberately. It is information about her day, not an
        allowance — the caveat in the card says so, because the moment a burn
        figure sits next to an intake figure people start subtracting one from
        the other, and this app's expenditure number already contains training.
      */}
      <div className="mt-3 max-w-xl">
        <BurnCard
          title="Training today"
          kcal={burnToday.reduce((n, d) => n + d.kcal, 0)}
          sub="burned"
          sessions={burnToday.length}
        />
      </div>
    </>
  );
}
