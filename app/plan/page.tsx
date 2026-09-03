import { PlanClient } from "@/components/plan-client";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { mealWeekView, pickableExercises, todayView, weekView } from "@/lib/views";
import { addDays, dayIndex, prettyDate, weekStart } from "@/lib/date";
import { profileToday } from "@/lib/profile";
import { foodUnitsOf } from "@/lib/food-units";
import { todayTargets } from "@/lib/tools/progression-targets";
import { equipmentToday } from "@/lib/tools/phases";

export const dynamic = "force-dynamic";

/**
 * The week.
 *
 * `?tab=` and `?day=` rather than component state, so the back button does
 * what it looks like it does and a day is a thing you can link someone to —
 * same reason the library is addressed by `?m=`.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; day?: string }>;
}) {
  const profile = await requireOnboarded();
  // Her day, not the server's: a 7pm dinner must not land on tomorrow.
  const her = profileToday(profile);
  const { tab, day } = await searchParams;

  const parsedDay = Number(day);
  const selected = Number.isInteger(parsedDay) && parsedDay >= 0 && parsedDay <= 6 ? parsedDay : dayIndex(her);
  const selectedDate = addDays(weekStart(her), selected);

  const [week, mealWeek, today, otherDay, pickable, targets] = await Promise.all([
    weekView(profile.id, profile.units, weekStart(her), her),
    mealWeekView(profile.id, foodUnitsOf(profile), weekStart(her), her),
    // Today's day, in full, so that selecting today on the training tab gives
    // her the same cards as the Train screen rather than a list of names.
    todayView(profile.id, profile.units, her),
    // The selected day, whichever it is — a plan to arrange if it is ahead,
    // a record of what she did if it is behind.
    todayView(profile.id, profile.units, selectedDate),
    pickableExercises(equipmentToday(profile, her).equipment),
    todayTargets(profile.id, profile.units, her),
  ]);

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Today, big, because "week of the 31st" answers a question nobody
              asked while leaving the one they did — what day is it — to be
              worked out from a date range. */}
          <h1 className="truncate text-2xl font-bold tracking-tight">{prettyDate(her)}</h1>
          {/* The week's own name is gone. It is the template's — "Full Body
              3× — Dumbbells & Bench" — and it goes stale the moment she
              renames a day or adds one, exactly like the blurb underneath it
              did. The days below say what the week is; the header only needs
              to say which week. */}
          <p className="mt-0.5 truncate text-[13px] text-muted">
            Week of {prettyDate(weekStart(her))}
          </p>
        </div>
        <AiOpinion page="plan" label="plan" />
      </header>
      <PlanClient
        week={week}
        mealWeek={mealWeek}
        tab={tab === "food" ? "food" : "training"}
        day={selected}
        today={today}
        otherDay={otherDay}
        otherDate={selectedDate}
        pickable={pickable}
        targets={targets}
      />
    </>
  );
}
