import { EatClient } from "@/components/eat-client";
import { cardOpen } from "@/lib/cards";
import { waterPresets, waterRow, waterTarget } from "@/lib/water";
import { requireOnboarded } from "@/lib/session";
import { dayFoodView, mealWeekView, savedMealsView, waterTotals } from "@/lib/views";
import { addDays, APP_TIMEZONE, hourIn, prettyDate, weekStart } from "@/lib/date";
import Link from "next/link";
import { DayStep } from "@/components/day-nav";
import { profileToday } from "@/lib/profile";
import { burnByDay } from "@/lib/progress";
import { foodUnitsOf } from "@/lib/food-units";
import { slotForHour } from "@/lib/nutrition";

export const dynamic = "force-dynamic";

/**
 * Today's food, the way Train is today's training.
 *
 * Eating was a column on the Plan screen, which made the thing she does three
 * times a day a sub-section of a weekly document. The two active screens are
 * now the two things happening today — train and eat — and Plan is what those
 * distil into over a week.
 */
export default async function EatPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const profile = await requireOnboarded();
  // Her day, not the server's: a 7pm dinner must not land on tomorrow.
  const her = profileToday(profile);

  /*
    The day on screen, which is not always today.

    It used to be today and only today, so at one minute past midnight
    yesterday's food became unreachable — the meals were all still there, with
    nothing in the app that could show them. Train has had arrows for months;
    this is the same `?d=`, validated the same way, and everything logged from
    this screen is filed against the day in the heading.
  */
  const { d } = await searchParams;
  const on = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? (d as typeof her) : her;
  const isToday = on === her;

  const [dayFood, mealWeek, saved, burnToday, water] = await Promise.all([
    dayFoodView(profile.id, on),
    mealWeekView(profile.id, foodUnitsOf(profile), weekStart(on), on),
    savedMealsView(profile.id),
    burnByDay(profile.id, on, on, profile.startWeightKg ?? 70),
    waterTotals(profile.id, on),
  ]);
  const waterGoal = waterTarget(profile);

  // The planned meals for the day being read, not for today — on Thursday's
  // page, Thursday's plan.
  const dayIndex = (new Date(`${on}T00:00:00Z`).getUTCDay() + 6) % 7;
  const today = mealWeek.days.find((d2) => d2.dayOfWeek === dayIndex) ?? null;

  return (
    <>
      {/*
        The date is the heading. "Eat" was the tab she tapped to get here and
        the word above it in the nav — repeating it at the top of the screen
        told her nothing she had not just been told twice, and pushed the only
        useful line, the day, into a caption above it.
      */}
      <header className="mb-5 flex items-center gap-1">
        <DayStep href={`/eat?d=${addDays(on, -1)}`} dir="left" label="The day before" />
        <h1 className="min-w-0 flex-1 truncate text-center text-2xl font-bold tracking-tight md:text-left">
          {isToday ? prettyDate(her) : prettyDate(on)}
        </h1>
        {/* The way back, only when she is not on it — an arrow to today from
            today is a control that does nothing. */}
        {!isToday && (
          <Link href="/eat" scroll={false} className="shrink-0 px-2 text-[12px] text-accent">
            Today
          </Link>
        )}
        <DayStep href={`/eat?d=${addDays(on, 1)}`} dir="right" label="The day after" />
      </header>

      <EatClient
        day={dayFood}
        saved={saved}
        planned={today?.meals ?? []}
        calorieTarget={mealWeek.exists ? mealWeek.calorieTarget : null}
        proteinTargetG={mealWeek.exists ? mealWeek.proteinTargetG : null}
        foodUnits={mealWeek.foodUnits}
        plannedOpen={cardOpen(profile.collapsedCards, "plannedFood")}
        isToday={isToday}
        // The sixth bar, and the buttons that fill it. Built here because
        // `waterRow` needs her food units and the target, both of which the
        // page already has — the card just paints it.
        water={{
          row: waterRow(water.today, waterGoal, mealWeek.foodUnits),
          presets: waterPresets(mealWeek.foodUnits),
          anythingLogged: water.today !== null,
        }}
      defaultSlot={slotForHour(hourIn(profile.timezone ?? APP_TIMEZONE))}
        burnKcal={burnToday.reduce((n, d) => n + d.kcal, 0)}
        burnSessions={burnToday.length}
      />

    </>
  );
}
