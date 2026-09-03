import { ShoppingList, type ShoppingAisle } from "@/components/shopping-list";
import { KitchenGrid } from "@/components/kitchen-grid";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { kitchenView } from "@/lib/views";
import { prettyDate, weekStart } from "@/lib/date";
import { profileToday } from "@/lib/profile";
import { foodUnitsOf } from "@/lib/food-units";
import { runTool } from "@/lib/tools";

export const dynamic = "force-dynamic";

/**
 * What is in the house.
 *
 * One screen, not two lists. Shopping and the pantry were separate tabs, each
 * a column of text read top to bottom — which is the wrong shape for both
 * jobs: in a supermarket she is scanning for one item among thirty, and at
 * the cupboard she is answering "have I got X". A grid of tiles with a state
 * each answers both at a glance, and the same chips-and-search the movement
 * picker uses cut it down before she reads anything.
 *
 * The list she takes to the shop is still a list — that is genuinely what a
 * shopping list is — so it stays, underneath, as the thing she shares or
 * sends to Instacart rather than the thing she manages her kitchen through.
 */
export default async function KitchenPage() {
  const profile = await requireOnboarded();
  const her = profileToday(profile);

  const [kitchen, shopping] = await Promise.all([
    kitchenView(profile.id, foodUnitsOf(profile), her),
    runTool("get_shopping_list", {}, { profileId: profile.id }) as Promise<{
      aisles?: ShoppingAisle[]; instacart: boolean;
    }>,
  ]);

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {kitchen.toBuy > 0
              ? `${kitchen.toBuy} to buy · week of ${prettyDate(weekStart(her))}`
              : `Week of ${prettyDate(weekStart(her))}`}
          </p>
        </div>
        <AiOpinion page="plan" label="the kitchen" />
      </header>

      <KitchenGrid items={kitchen.items} hasMealPlan={kitchen.hasMealPlan} />

      <div className="mt-6">
        <ShoppingList
          weekStart={weekStart(her)}
          aisles={shopping.aisles ?? []}
          instacart={shopping.instacart}
        />
      </div>
    </>
  );
}
