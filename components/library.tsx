"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Item = { slug: string; name: string; category: string; primaryMuscles: string[]; equipment: string[] };
type FactItem = { id: string; category: string; text: string; source: string | null };

const CATEGORIES = ["all", "compound", "isolation", "core", "mobility", "cardio"] as const;

const FACT_LABELS: Record<string, string> = {
  sedentary_risk: "The cost of sitting",
  strength: "Strength",
  nutrition: "Nutrition",
  recovery: "Recovery",
  motivation: "Sticking with it",
  womens_health: "Women's health",
};

export function Library({ exercises, facts }: { exercises: Item[]; facts: FactItem[] }) {
  const [tab, setTab] = useState<"moves" | "know">("moves");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (category === "all" || e.category === category) &&
        (q === "" ||
          e.name.toLowerCase().includes(q) ||
          e.primaryMuscles.some((m) => m.includes(q)) ||
          e.equipment.some((m) => m.includes(q))),
    );
  }, [exercises, query, category]);

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
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
        {([["moves", "Movements"], ["know", "Worth knowing"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-full py-2 text-[13px] font-medium transition-colors ${
              tab === k ? "bg-accent text-ink" : "text-muted"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "moves" ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movements, muscles, equipment…"
            className="mb-3 w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
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

          <div className="card divide-y divide-line">
            {filtered.map((e) => (
              <Link key={e.slug} href={`/learn/${e.slug}`} className="flex items-center gap-3 p-4 active:bg-raised">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{e.name}</p>
                  <p className="truncate text-[12px] text-faint">{e.primaryMuscles.join(" · ")}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" className="shrink-0 text-faint"><path d="m9 18 6-6-6-6" /></svg>
              </Link>
            ))}
            {filtered.length === 0 && <p className="p-6 text-center text-[13px] text-faint">Nothing matches that.</p>}
          </div>
        </>
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
      )}
    </>
  );
}
