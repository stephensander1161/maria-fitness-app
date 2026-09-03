import Link from "next/link";
import { ShoppingList, type ShoppingAisle } from "@/components/shopping-list";
import { Kitchen } from "@/components/kitchen";
import { AiOpinion } from "@/components/ai-opinion";
import { requireOnboarded } from "@/lib/session";
import { pantryView } from "@/lib/views";
import { prettyDate, weekStart } from "@/lib/date";
import { profileToday } from "@/lib/profile";
import { foodUnitsOf } from "@/lib/food-units";
import { runTool } from "@/lib/tools";

export const dynamic = "force-dynamic";

/**
 * Shopping and the kitchen, given a screen.
 *
 * Both were collapsed cards two thirds of the way down the Plan page, which
 * is the worst place for the two things she does *standing up and holding a
 * phone* — one in a supermarket aisle, one in front of a cupboard. Neither is
 * about the week's plan; they are about what is in the house.
 *
 * `?tab=` rather than component state, for the same reason as everywhere else:
 * the back button, and a screen she can link to.
 */
export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await requireOnboarded();
  const her = profileToday(profile);
  const { tab } = await searchParams;
  const on = tab === "have" ? "have" : "shopping";

  const [shopping, pantry] = await Promise.all([
    runTool("get_shopping_list", {}, { profileId: profile.id }) as Promise<{ aisles?: ShoppingAisle[]; instacart: boolean }>,
    pantryView(profile.id, foodUnitsOf(profile), her),
  ]);

  const toBuy = (shopping.aisles ?? []).reduce((n, a) => n + a.items.length, 0);

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-muted">Week of {prettyDate(weekStart(her))}</p>
        </div>
        <AiOpinion page="plan" label="the list and your kitchen" />
      </header>

      <div className="mb-4 flex gap-6 border-b border-line">
        {([["shopping", "Shopping", toBuy], ["have", "What I have", pantry.items.length]] as const).map(
          ([key, label, count]) => (
            <Link
              key={key}
              href={`/kitchen?tab=${key}`}
              scroll={false}
              aria-current={on === key ? "page" : undefined}
              className={`-mb-px border-b-2 px-1 pb-2.5 text-[14px] font-medium transition-colors ${
                on === key ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {label}
              <span className="ml-1.5 text-[11px] text-faint tabular">{count}</span>
            </Link>
          ),
        )}
      </div>

      {on === "shopping" ? (
        <ShoppingList
          weekStart={weekStart(her)}
          aisles={shopping.aisles ?? []}
          instacart={shopping.instacart}
          expanded
        />
      ) : (
        <Kitchen pantry={pantry} expanded />
      )}

    </>
  );
}
