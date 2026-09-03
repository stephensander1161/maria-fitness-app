import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises, facts } from "@/lib/db/schema";
import { Library } from "@/components/library";
import { MovementDetail } from "@/components/movement-detail";
import { movementView } from "@/lib/views";
import { requireOnboarded } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The library, as master-detail on a desktop and as a list on a phone.
 *
 * `?m=<slug>` selects a movement. On a wide screen the list stays put on the
 * left and the movement fills the right pane — browsing a library means
 * comparing things, and a list that navigates away makes you hold each one in
 * your head. On a phone there is no room for both, so the selection replaces
 * the list and a back link returns to it.
 */
export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  await requireOnboarded();
  const { m } = await searchParams;

  const [moves, allFacts] = await Promise.all([
    db.select({
      slug: exercises.slug, name: exercises.name, category: exercises.category,
      primaryMuscles: exercises.primaryMuscles, equipment: exercises.equipment,
    }).from(exercises).orderBy(asc(exercises.name)),
    db.select({ id: facts.id, category: facts.category, text: facts.text, source: facts.source })
      .from(facts).orderBy(asc(facts.category)),
  ]);

  const selected = m && moves.some((e) => e.slug === m) ? m : null;
  const move = selected ? await movementView(selected) : null;

  return (
    <div className="md:flex md:gap-6">
      {/* The list. Hidden on a phone once something is selected. */}
      {/*
        The list keeps its own scroll and stays put while the pane beside it
        moves — 125 movements would otherwise push the detail down the page and
        make the pair useless together, which is the only reason to show both.
      */}
      <div
        className={`md:sticky md:top-0 md:max-h-[calc(100dvh-4rem)] md:w-[22rem] md:shrink-0 md:overflow-y-auto md:pr-1 ${
          selected ? "hidden md:block" : ""
        }`}
      >
        <h1 className="mb-5 text-2xl font-bold tracking-tight md:text-xl">Learn</h1>
        <Library exercises={moves} facts={allFacts} selected={selected} />
      </div>

      {/* The detail. On a phone this *is* the page when something is selected. */}
      <div className={`min-w-0 flex-1 ${selected ? "" : "hidden md:block"}`}>
        {selected ? (
          <>
            {/* On a phone the pane is the page, so it needs a way back. */}
            <Link
              href="/learn"
              scroll={false}
              className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted md:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Library
            </Link>
            {move && <MovementDetail move={move} pane />}
          </>
        ) : (
          <div className="hidden h-full min-h-[24rem] place-items-center rounded-2xl border border-dashed border-line md:grid">
            <p className="max-w-xs text-center text-[13px] leading-relaxed text-faint">
              Pick a movement to see how it is done, what it works, and how to make it easier or harder.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
