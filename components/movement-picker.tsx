"use client";

import { useMemo, useState } from "react";
import { ExerciseFigure } from "./exercise-figure";
import type { PickableExercise } from "@/lib/views";

/**
 * Choose a movement by looking at it.
 *
 * A native dropdown over a hundred and sixty movements is a wheel you scroll
 * for a while looking for the word "core", and a name alone asks her to know
 * what a movement is before she picks it. So: the part of the body first — six
 * chips, which is the question she is actually asking — then a grid of
 * figures, where the shape of the drawing says what it is before the name
 * does. Typing cuts across every group, because once she knows the name
 * searching beats tapping.
 *
 * Shared by "add an exercise" and "that was actually a different movement",
 * which are the same question asked twice.
 */
export function MovementPicker({
  groups, value, onPick, emptyHint,
}: {
  groups: { group: string; items: PickableExercise[] }[];
  value: string;
  onPick: (slug: string) => void;
  /** What to say when a search matches nothing. */
  emptyHint?: string;
}) {
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const all = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))),
    [groups],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return all.filter((i) =>
        i.name.toLowerCase().includes(q)
        || i.muscles.some((m) => m.includes(q))
        // The name she uses, which is often not the name it has.
        || i.tags.some((t) => t.includes(q)));
    }
    return group ? all.filter((i) => i.group === group) : [];
  }, [all, group, query]);

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search movements…"
        aria-label="Search movements"
        className="w-full rounded-xl border border-edge bg-base px-3.5 py-2.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
      />

      {!query && (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button
              key={g.group}
              onClick={() => setGroup(group === g.group ? null : g.group)}
              aria-pressed={group === g.group}
              className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
                group === g.group
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-muted hover:bg-raised"
              }`}
            >
              {g.group}
              <span className="ml-1.5 text-[11px] text-faint">{g.items.length}</span>
            </button>
          ))}
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {shown.map((i) => (
            <button
              key={i.slug}
              onClick={() => onPick(i.slug)}
              aria-pressed={value === i.slug}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                value === i.slug ? "border-accent bg-accent-soft" : "border-line bg-base hover:bg-raised"
              }`}
            >
              <ExerciseFigure
                slug={i.slug}
                category={i.category}
                className={`h-14 w-14 ${value === i.slug ? "text-accent" : "text-muted"}`}
              />
              <span className={`text-[12px] leading-tight ${value === i.slug ? "text-accent" : "text-text"}`}>
                {i.name}
              </span>
              <span className="text-[10px] leading-tight text-faint">{i.muscles.slice(0, 2).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}

      {!query && !group && (
        <p className="py-2 text-center text-[13px] text-faint">
          Pick a part of the body, or search for a movement by name.
        </p>
      )}

      {query && shown.length === 0 && (
        <p className="py-2 text-center text-[13px] text-faint">
          {emptyHint ?? "Nothing matching that in your equipment. Ask your coach — it can add one."}
        </p>
      )}
    </div>
  );
}
