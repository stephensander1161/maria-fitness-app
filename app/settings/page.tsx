import { requireOnboarded } from "@/lib/session";
import { runTool } from "@/lib/tools";
import { SignOut } from "@/components/sign-out";
import { CoachBudget, type Usage } from "@/components/coach-budget";
import { UnitsSettings } from "@/components/units-settings";
import { CoachTone } from "@/components/coach-tone";
import { PlanSetupButton } from "@/components/plan-setup";
import { AiOpinion } from "@/components/ai-opinion";
import { EraseData } from "@/components/erase-data";
import { RestSettings } from "@/components/rest-settings";
import { WeighInReminder } from "@/components/weigh-in-reminder";
import { vapidPublicKey } from "@/lib/push";
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
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{user?.name ?? profile.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">Your coach, your units, your account.</p>
        </div>
        <AiOpinion page="progress" label="your setup" />
      </header>

      {/*
        One column on a phone; two columns of *groups* on a wide screen.

        Not a masonry of cards. A card grid put seven different heights in two
        columns and gave every one of them a ragged edge and no order at all,
        which is how this came to be a single 36rem column — and on a 27-inch
        screen that column read as a phone app with a foot of empty either side.
        The group is the unit here: each column is read down, in order, and the
        left column comes first. The whole thing is still capped, because
        settings are read, not scanned, and a 100rem grid is scanned.
      */}
      <div className="max-w-xl lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-x-8">
        <div>
          <Group title="Your coach">
            <CoachTone tone={profile.coachTone} />
            <CoachBudget usage={usage as Usage} />
          </Group>

          <Group title="How things are shown">
            <UnitsSettings units={profile.units} foodUnits={profile.foodUnits} />
          </Group>

          <Group title="Reminders">
            <WeighInReminder hour={profile.weighInReminderHour} vapidPublicKey={vapidPublicKey()} />
          </Group>
        </div>

        <div>
          <Group title="Training">
            <RestSettings
              defaultRestSeconds={profile.defaultRestSeconds}
              restByGroup={profile.restByGroup}
            />
          </Group>

          <Group title="Your plan">
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
          </Group>

          <Group title="Your account">
            {/* Last, and the only thing here that cannot be undone. */}
            <EraseData />
          </Group>
        </div>
      </div>

      {/*
        Only where there is no sidebar. On a desktop, signing out is a row in
        the menu beneath "Tell us" — a menu is where a mouse looks for it, and
        it should not take opening Settings to leave.
      */}
      <div className="max-w-xl md:hidden">
        <SignOut />
      </div>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-faint">{title}</h2>
      {children}
    </section>
  );
}
