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
import { PlannedDay } from "@/components/planned-day";
import { DayNav } from "@/components/day-nav";

export const dynamic = "force-dynamic";

/**
 * Today's session — or another day's, when she steps off it.
 *
 * `?d=` moves the screen a day at a time: forward to arrange tomorrow, back to
 * see how a session actually went. Only today gets the logging cards. Logging
 * a set records it against *today* whatever screen it was tapped on, so
 * offering the same controls on Thursday would file Thursday's work under
 * Wednesday — the same class of bug as reading the server's date instead of
 * hers.
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
      />
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium uppercase tracking-wide text-accent">{view.dayName}</p>
          {view.hasPlan && isToday ? (
            <DayTitle title={view.title} dayOfWeek={dayIndex(her)} focus={view.focus} />
          ) : (
            <>
              <h1 className="truncate text-2xl font-bold tracking-tight">{view.title}</h1>
              {view.focus && <p className="mt-1 text-sm text-muted">{view.focus}</p>}
            </>
          )}
        </div>
        <AiOpinion page="train" label="session" />
      </header>
      {isToday ? (
        <TrainClient view={view} pickable={pickable} targets={targets} />
      ) : (
        <section className="card p-4">
          <PlannedDay
            view={view}
            pickable={pickable}
            dayOfWeek={dayIndex(on)}
            past={on < her}
          />
        </section>
      )}
    </>
  );
}
