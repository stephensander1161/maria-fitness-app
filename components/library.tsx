"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExerciseFigure } from "./exercise-figure";
import { IngredientSearch } from "./ingredient-search";
import { Ideas, type MealIdea, type MoveIdea } from "./ideas";
import { groupForExercise, LIBRARY_GROUP_ORDER } from "@/lib/muscle-groups";
import type { MealWeekView, WeekView } from "@/lib/views";

/** The gym name she typed, when it is not the name on the row. */
function matchedTag(tags: string[], q: string): string | null {
  if (!q) return null;
  return tags.find((t) => t.includes(q)) ?? null;
}

type Item = {
  slug: string; name: string; category: string;
  primaryMuscles: string[]; equipment: string[];
  /** What people call it in a gym, which is often not its name. */
  tags: string[];
};
type FactItem = { id: string; category: string; text: string; source: string | null };

const CATEGORIES = ["all", ...LIBRARY_GROUP_ORDER] as const;

const FACT_LABELS: Record<string, string> = {
  sedentary_risk: "The cost of sitting",
  strength: "Strength",
  nutrition: "Nutrition",
  recovery: "Recovery",
  motivation: "Sticking with it",
  womens_health: "Women's health",
};

export function Library({
  exercises, facts, selected = null, active, week, mealWeek, mealIdeas, moveIdeas,
}: {
  exercises: Item[];
  facts: FactItem[];
  selected?: string | null;
  active: "moves" | "food" | "ideas" | "know";
  week: WeekView;
  mealWeek: MealWeekView;
  mealIdeas: MealIdea[];
  moveIdeas: MoveIdea[];
}) {
  // The tab lives in the URL, not in state: the page needs it to decide
  // whether to show the detail pane beside the list, and a tab you can link to
  // is a tab you can send someone.
  const tab = active;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return exercises.filter(
      (e) =>
        (category === "all" || groupForExercise(e) === category) &&
        (q === "" ||
          e.name.toLowerCase().includes(q) ||
          e.primaryMuscles.some((m) => m.includes(q)) ||
          e.equipment.some((m) => m.includes(q)) ||
          // "bow extension" should find the overhead triceps extension.
          e.tags.some((t) => t.includes(q))),
    );
  }, [exercises, q, category]);

  // Grouped by what a movement works, not by whether a textbook calls it
  // compound — that bucket held sixty-three of a hundred and sixty, which is
  // not a group, it is the library with a label on. Nobody goes looking for an
  // isolation exercise; they go looking for something for their shoulders.
  const grouped = useMemo(() => {
    return LIBRARY_GROUP_ORDER.flatMap((group) => {
      const items = filtered.filter((e) => groupForExercise(e) === group);
      return items.length ? [{ category: group, items }] : [];
    });
  }, [filtered]);

  const byCategory = useMemo(() => {
    const map = new Map<string, FactItem[]>();
    for (const f of facts) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return [...map.entries()];
  }, [facts]);

  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-full border border-line bg-surface p-1">
        {([["moves", "Moves"], ["food", "Food"], ["ideas", "Ideas"], ["know", "Facts"]] as const).map(([k, label]) => (
          <Link
            key={k}
            href={k === "moves" ? "/learn" : `/learn?t=${k}`}
            scroll={false}
            aria-current={tab === k ? "page" : undefined}
            className={`rounded-full py-2.5 text-center text-[13px] font-medium transition-colors ${
              tab === k ? "bg-accent text-on-accent" : "text-muted hover:bg-raised"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "food" && <IngredientSearch />}

      {tab === "ideas" && (
        <Ideas week={week} mealWeek={mealWeek} initialMeals={mealIdeas} initialMoves={moveIdeas} />
      )}

      {tab === "moves" ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movements, muscles, equipment…"
            aria-label="Search movements, muscles or equipment"
            className="mb-3 w-full rounded-xl border border-edge bg-surface px-4 py-3 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] capitalize ${
                  category === c ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
                }`}>
                {c}
              </button>
            ))}
          </div>

          <p className="mb-2 text-[11px] text-faint">
            {filtered.length} of {exercises.length} movements
          </p>

          {/* Grouped rather than one flat run. At 46 movements a single list was
              fine; at 125 it is unscannable, and the category is the first thing
              you narrow by when looking for something. */}
          {grouped.map(({ category, items }) => (
            <section key={category} className="mb-3">
              <h2 className="sticky top-0 z-10 -mx-4 bg-base/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-faint backdrop-blur">
                {category} <span className="font-normal normal-case tracking-normal">· {items.length}</span>
              </h2>
              <div className="card divide-y divide-line">
                {items.map((e) => (
                  <Link
                    key={e.slug}
                    // Query rather than route: the desktop pane and the phone
                    // page are the same URL, so a link works on both and can
                    // be shared.
                    href={`/learn?m=${e.slug}`}
                    scroll={false}
                    aria-current={e.slug === selected ? "true" : undefined}
                    className={`flex items-center gap-3 p-4 transition-colors hover:bg-raised active:bg-raised ${
                      e.slug === selected ? "bg-raised" : ""
                    }`}
                  >
                    <ExerciseFigure
                      slug={e.slug}
                      category={e.category}
                      className="size-11 shrink-0 text-muted"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{e.name}</p>
                      {/* Say which of her words matched, or "bow extension"
                          returning "Overhead Triceps Extension" reads as the
                          wrong answer. */}
                      {matchedTag(e.tags, q) ? (
                        <p className="truncate text-[12px] text-accent">
                          also &ldquo;{matchedTag(e.tags, q)}&rdquo;
                        </p>
                      ) : (
                        <p className="truncate text-[12px] text-faint">{e.primaryMuscles.join(" · ")}</p>
                      )}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" className="shrink-0 text-faint"><path d="m9 18 6-6-6-6" /></svg>
                  </Link>
                ))}
              </div>
            </section>
          ))}

          {filtered.length === 0 && (
            <div className="card p-6 text-center">
              <p className="text-[13px] text-faint">Nothing matches that.</p>
              {query && (
                <button onClick={() => setQuery("")} className="mt-3 text-[13px] text-accent">
                  Clear search
                </button>
              )}
            </div>
          )}
        </>
      ) : tab === "know" ? (
        facts.length === 0 ? (
          <p className="card p-5 text-[13px] leading-relaxed text-muted">
            The fact library hasn&rsquo;t been loaded on this deployment yet. Pull down on any screen
            and your coach will still find you something worth knowing.
          </p>
        ) : (
        <div className="space-y-5">
          {byCategory.map(([cat, items]) => (
            <section key={cat}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
                {FACT_LABELS[cat] ?? cat}
              </h2>
              <div className="space-y-2">
                {items.map((f) => (
                  <article key={f.id} className="card p-4">
                    <p className="text-[14px] leading-relaxed">{f.text}</p>
                    {f.source && <p className="mt-2 text-[11px] text-faint">{f.source}</p>}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        )
      ) : null}
    </>
  );
}
