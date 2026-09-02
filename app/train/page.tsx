import { TrainClient } from "@/components/train-client";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { profileToday } from "@/lib/profile";
import { pickableExercises, todayView } from "@/lib/views";
import { PlanSetupInvite } from "@/components/plan-setup";

export const dynamic = "force-dynamic";

export default async function TrainPage() {
  const profile = await requireOnboarded();
  const [view, pickable] = await Promise.all([
    todayView(profile.id, profile.units, profileToday(profile)),
    pickableExercises(profile.equipment),
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
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium uppercase tracking-wide text-accent">{view.dayName}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">{view.title}</h1>
          {view.focus && <p className="mt-1 text-sm text-muted">{view.focus}</p>}
        </div>
        <AiOpinion page="train" label="session" />
      </header>
      <TrainClient view={view} pickable={pickable} />
    </>
  );
}
