import { TrainClient } from "@/components/train-client";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { profileToday } from "@/lib/profile";
import { pickableExercises, todayView } from "@/lib/views";
import { todayTargets } from "@/lib/tools/progression-targets";
import { PlanSetupInvite } from "@/components/plan-setup";
import { equipmentToday } from "@/lib/tools/phases";
import { DayTitle } from "@/components/day-title";
import { addDays, dayIndex, prettyDate } from "@/lib/date";
import { DayNav } from "@/components/day-nav";

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
      <DayNav
        base="/train"
        param="d"
        prev={addDays(on, -1)}
        next={addDays(on, 1)}
        today={her}
        label={prettyDate(on)}
        isToday={isToday}
        actions={<AiOpinion page="train" label="session" />}
      >
        <p className="text-[13px] font-medium uppercase tracking-wide text-accent">{view.dayName}</p>
        {view.hasPlan ? (
          <DayTitle title={view.title} dayOfWeek={dayIndex(on)} focus={view.focus} />
        ) : (
          <>
            <h1 className="truncate text-2xl font-bold tracking-tight">{view.title}</h1>
            {view.focus && <p className="mt-1 text-sm text-muted">{view.focus}</p>}
          </>
        )}
      </DayNav>

      {/* The same cards on every day. A movement is a movement; having one UI
          for today and a list of names for every other day was two things to
          build and one of them permanently behind. What the day changes is
          what can be done on it, which the cards decide for themselves. */}
      <TrainClient view={view} pickable={pickable} targets={targets} date={on} isToday={isToday} />
    </>
  );
}
