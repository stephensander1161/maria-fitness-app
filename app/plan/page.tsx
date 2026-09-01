import { PlanClient } from "@/components/plan-client";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { mealWeekView, weekView } from "@/lib/views";
import { prettyDate, weekStart } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const profile = await requireOnboarded();
  const [week, mealWeek] = await Promise.all([
    weekView(profile.id, profile.units),
    mealWeekView(profile.id),
  ]);

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium uppercase tracking-wide text-accent">
            Week of {prettyDate(weekStart())}
          </p>
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {week.exists ? week.title : "Your plan"}
          </h1>
        </div>
        <AiOpinion page="plan" label="plan" />
      </header>
      <PlanClient week={week} mealWeek={mealWeek} />
    </>
  );
}
