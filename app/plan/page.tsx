import { PlanClient } from "@/components/plan-client";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { mealWeekView, pantryView, weekView } from "@/lib/views";
import { prettyDate, weekStart } from "@/lib/date";
import { profileToday } from "@/lib/profile";
import { foodUnitsOf } from "@/lib/food-units";
import { runTool } from "@/lib/tools";
import type { ShoppingAisle } from "@/components/shopping-list";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const profile = await requireOnboarded();
  // Her day, not the server's: a 7pm dinner must not land on tomorrow.
  const her = profileToday(profile);

  const [week, mealWeek, shopping, pantry] = await Promise.all([
    weekView(profile.id, profile.units, weekStart(her), her),
    mealWeekView(profile.id, foodUnitsOf(profile), weekStart(her), her),
    runTool("get_shopping_list", {}, { profileId: profile.id }) as Promise<{ aisles?: ShoppingAisle[]; instacart: boolean }>,
    pantryView(profile.id, foodUnitsOf(profile), her),
  ]);

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium uppercase tracking-wide text-accent">
            Week of {prettyDate(weekStart(her))}
          </p>
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {week.exists ? week.title : "Your plan"}
          </h1>
        </div>
        <AiOpinion page="plan" label="plan" />
      </header>
      <PlanClient
        week={week}
        mealWeek={mealWeek}
        shopping={shopping.aisles ?? []}
        instacart={shopping.instacart}
        pantry={pantry}
      />
    </>
  );
}
