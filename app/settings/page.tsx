import { requireOnboarded } from "@/lib/session";
import { runTool } from "@/lib/tools";
import { SignOut } from "@/components/sign-out";
import { CoachBudget, type Usage } from "@/components/coach-budget";
import { UnitsSettings } from "@/components/units-settings";
import { CoachTone } from "@/components/coach-tone";
import { PlanSetupButton } from "@/components/plan-setup";
import { TranscriptExport } from "@/components/transcript-export";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * You.
 *
 * These were the bottom third of Progress, which is a screen about how
 * training is going — how the coach talks, what units she reads, what it may
 * spend and how to get the transcript out are not that. They are settings,
 * and they were being scrolled past to reach the sign-out button.
 */
export default async function SettingsPage() {
  const profile = await requireOnboarded();
  const user = await currentUser();
  const usage = await runTool("get_coach_usage", {}, { profileId: profile.id });

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{user?.name ?? profile.name}</h1>
        <p className="mt-0.5 text-[13px] text-muted">Your coach, your units, your account.</p>
      </header>

      <div className="space-y-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0 xl:[&>*]:mb-3">
        <CoachTone tone={profile.coachTone} />
        <UnitsSettings units={profile.units} foodUnits={profile.foodUnits} />
        <CoachBudget usage={usage as Usage} />
        <PlanSetupButton
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
        <TranscriptExport />
      </div>

      <SignOut />
    </>
  );
}
