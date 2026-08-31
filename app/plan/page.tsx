import { PlanClient } from "@/components/plan-client";
import { getProfile } from "@/lib/profile";
import { mealWeekView, weekView } from "@/lib/views";
import { prettyDate, weekStart } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const profile = await getProfile();
  const [week, mealWeek] = await Promise.all([
    weekView(profile.id, profile.units),
    mealWeekView(profile.id),
  ]);

  return (
    <>
      <header className="mb-5">
        <p className="text-[13px] font-medium uppercase tracking-wide text-accent">
          Week of {prettyDate(weekStart())}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{week.exists ? week.title : "Your plan"}</h1>
      </header>
      <PlanClient week={week} mealWeek={mealWeek} />
    </>
  );
}
