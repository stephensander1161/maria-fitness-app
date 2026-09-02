import { Coach } from "@/components/coach";
import { PlanSetupInvite } from "@/components/plan-setup";
import { requireOnboarded } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const profile = await requireOnboarded();

  // Once, unless she asks for it again: the invitation goes when she has been
  // through the setup or said not now, and lives on the Progress screen from
  // then on.
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
      <Coach initialName={profile.name} />
    </>
  );
}
