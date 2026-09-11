import { TrainClient } from "@/components/train-client";
import { requireOnboarded } from "@/lib/session";
import { profileToday } from "@/lib/profile";
import { pickableExercises, todayView } from "@/lib/views";
import { todayTargets } from "@/lib/tools/progression-targets";
import { PlanSetupInvite } from "@/components/plan-setup";
import { equipmentToday } from "@/lib/tools/phases";
import { DayTitle } from "@/components/day-title";
import { dayEyebrow } from "@/lib/day-label";
import { addDays, dayIndex, prettyDate, weekStart } from "@/lib/date";
import { rollForward } from "@/lib/plan-rollover";
import { DayLabel, DayStep } from "@/components/day-nav";

export const dynamic = "force-dynamic";

/**
 * Today's session — or another day's, when she steps off it.
 *
 * `?d=` moves the screen a day at a time: forward to arrange tomorrow, back to
 * see how a session actually went. Every day gets the same cards — a movement
 * is a movement, and one UI for today with a list of names for every other day
 * was two things to build and one of them permanently behind.
 *
 * What the day changes is what gets written. Each card files its sets against
 * the day on screen rather than against her today, which is the whole reason
 * the date is stated at the top: a screen showing Thursday while the buttons
 * write to Wednesday is the most confusing thing this app could do.
 */
export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const profile = await requireOnboarded();
  const her = profileToday(profile);
  const { d } = await searchParams;
  // Only a real date in her own week-shaped world; anything else is today.
  const on = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? (d as typeof her) : her;
  const isToday = on === her;

  // The programme repeats: a week with no plan of its own inherits the last
  // one, so Monday morning is not an empty screen. Idempotent, and it only
  // ever writes on the first view of a new week.
  await rollForward(profile.id, weekStart(on));

  const [view, pickable, targets] = await Promise.all([
    todayView(profile.id, profile.units, on),
    pickableExercises(equipmentToday(profile, her).equipment),
    // Worked out, not guessed: double progression and the 2-for-2 rule over
    // what she actually logged. The screen shows the number; nobody has to
    // ask the coach for it.
    todayTargets(profile.id, profile.units, her),
  ]);

  // Once, unless she asks for it again: the invitation goes when she has been
  // through the setup or said not now, and lives on Progress from then on.
  // Onboarding asks these questions too and stamps planSetupAt, so this is an
  // invitation for a profile that has genuinely never been through either —
  // an account created before the first-run form existed. Anyone who filled
  // that in has already answered all of it.
  const invite = profile.planSetupAt === null && profile.planSetupSkippedAt === null;

  return (
    <>
      {invite && (
        <PlanSetupInvite
          defaults={{
            daysPerWeek: profile.daysPerWeek,
            sessionMinutes: profile.sessionMinutes,
            equipment: profile.equipment,
            injuries: profile.injuries,
            dietaryRestrictions: profile.dietaryRestrictions,
            dislikedFoods: profile.dislikedFoods,
            cookingSkill: profile.cookingSkill,
          }}
        />
      )}
      {/* The same cards on every day. A movement is a movement; having one UI
          for today and a list of names for every other day was two things to
          build and one of them permanently behind. What the day changes is
          what can be done on it, which the cards decide for themselves. */}
      <TrainClient
        tone={profile.coachTone}
        view={view}
        pickable={pickable}
        targets={targets}
        date={on}
        isToday={isToday}
        // The arrows either side of the day's own name, in the card that
        // already carries it. They were a strip of their own above it, which
        // made the top of the screen two containers saying one thing.
        stepBack={<DayStep href={`/train?d=${addDays(on, -1)}`} dir="left" label="The day before" />}
        stepOn={<DayStep href={`/train?d=${addDays(on, 1)}`} dir="right" label="The day after" />}
        dayLine={
          <DayLabel base="/train" param="d" date={on} today={her} label={prettyDate(on)} isToday={isToday} />
        }
        // The day's name and the session clock in one row, rather than a
        // heading centred under the date arrows and then a Start button on a
        // line of its own beneath it — three stacked blocks saying two things,
        // which on a phone is most of what is above the first movement.
        heading={
          <>
            {view.hasPlan ? (
              // The line under the name says "Today" on today and "Tue, Sep 8"
              // on any other day — so the weekday is only worth repeating here
              // on the day that line does not name, and only on a phone, where
              // the two are inches apart rather than a heading and a caption at
              // opposite ends of a wide screen.
              <DayTitle
                title={view.title}
                dayOfWeek={dayIndex(on)}
                focus={view.focus}
                compact
                prefix={isToday ? view.dayName : undefined}
                prefixOn="phone"
                align="centre"
              />
            ) : (
              <p className="text-[17px] font-semibold md:text-2xl">
                {isToday && dayEyebrow(view.dayName, view.title) && (
                  <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent md:hidden">
                    {dayEyebrow(view.dayName, view.title)} ·
                  </span>
                )}
                {view.title}
              </p>
            )}
          </>
        }
      />
    </>
  );
}
