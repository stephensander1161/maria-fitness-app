import Link from "next/link";
import { currentUser } from "@/lib/session";
import { tierOf } from "@/lib/tiers";
import { Kitchen, type ShoppingAisle } from "@/components/kitchen";
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

  // The Kitchen is Pro — lib/tiers.ts. A free account gets the screen's
  // name and one honest line, not a grid of things it cannot use.
  if (tierOf(await currentUser()) === "free") {
    return (
      <>
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">Kitchen</h1>
        </header>
        <section className="card p-5">
          <p className="text-[15px] font-semibold">Part of Sore Winner Pro</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Meal plans for the week, what is in the fridge, and a shopping list that knows what you already have.
            Logging what you eat works on the free plan as always.
          </p>
          <Link href="/settings" className="mt-3 inline-block rounded-xl bg-accent px-4 py-3 text-[14px] font-semibold text-on-accent">Go Pro in Settings</Link>
        </section>
      </>
    );
  }

  const [kitchen, shopping] = await Promise.all([
    kitchenView(profile.id, foodUnitsOf(profile), her),
    runTool("get_shopping_list", {}, { profileId: profile.id }) as Promise<{
      aisles?: ShoppingAisle[]; instacart: boolean;
    }>,
  ]);

  const week = weekStart(her);
  const mealsCovered = (shopping as { mealsCovered?: number }).mealsCovered ?? 0;
  const categories = Object.fromEntries(kitchen.items.map((i) => [i.item, i.category]));
  // The same number the list shows: lines the kitchen does not already cover.
  const toBuy = (shopping.aisles ?? []).flatMap((a) => a.items).filter((i) => i.inKitchen !== "have").length;
  const line = [
    toBuy > 0 ? `${toBuy} to buy` : null,
    mealsCovered > 0 ? `${mealsCovered} meal${mealsCovered === 1 ? "" : "s"} planned` : null,
    `week of ${prettyDate(week)}`,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Kitchen</h1>
        <p className="mt-1 text-[13px] text-muted">{line}</p>
      </header>

      <Kitchen
        weekStart={week}
        mealsCovered={mealsCovered}
        hasMealPlan={kitchen.hasMealPlan}
        instacart={shopping.instacart}
        aisles={shopping.aisles ?? []}
        pantry={kitchen.items}
        categories={categories}
      />
    </>
  );
}
