"use client";

import { useMemo, useState } from "react";
import { ExerciseFigure } from "./exercise-figure";
import type { Pickable } from "@/lib/views";
import { matchesQuery } from "@/lib/search-terms";

/** The gym name she typed, when it is not the name on the card. */
function aliasFor(tags: string[], q: string): string | null {
  if (!q) return null;
  return tags.find((t) => t.includes(q)) ?? null;
}

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
  pickable, value, onPick, emptyHint,
}: {
  pickable: Pickable;
  value: string;
  onPick: (slug: string) => void;
  /** What to say when a search matches nothing. */
  emptyHint?: string;
}) {
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const { groups, unavailable } = pickable;
  const all = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))),
    [groups],
  );

  const q = query.trim().toLowerCase();

  /** The one she has chosen, so its cues can be shown before she commits. */
  const picked = useMemo(
    () => pickable.groups.flatMap((g) => g.items).find((i) => i.slug === value) ?? null,
    [pickable, value],
  );

  const shown = useMemo(() => {
    if (q) {
      // Spelling-tolerant: "pull ups", "pull-up" and "pullup" are one search.
      return all.filter((i) => matchesQuery(q, i));
    }
    return group ? all.filter((i) => i.group === group) : [];
  }, [all, group, q]);

  /**
   * Matches she cannot do yet, and the one thing in the way.
   *
   * Silently hiding these is what made searching "pull up" baffling: someone
   * with dumbbells and no bar saw the two weighted variants and nothing else,
   * because those list a dumbbell among their equipment. Saying what is
   * missing is both an explanation and a to-do.
   */
  const blocked = useMemo(() => {
    if (!q) return [];
    return unavailable.filter((i) => matchesQuery(q, i));
  }, [unavailable, q]);

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

      {blocked.length > 0 && (
        <p className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
          {blocked.length} more {blocked.length === 1 ? "match needs" : "matches need"}{" "}
          <span className="text-text">{[...new Set(blocked.map((b) => b.missing))].join(" or ")}</span>,
          which isn&apos;t on your equipment list — {blocked.slice(0, 4).map((b) => b.name).join(", ")}
          {blocked.length > 4 ? " and more" : ""}. Add it in plan setup and they appear here.
        </p>
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
              {/*
                She searched for "bow extension" and this is the overhead
                triceps extension. Matching silently and showing only the
                library's name reads as the wrong result — say which of her
                words this answers to.
              */}
              {aliasFor(i.tags, q) ? (
                <span className="text-[10px] leading-tight text-accent">
                  also &ldquo;{aliasFor(i.tags, q)}&rdquo;
                </span>
              ) : (
                <span className="text-[10px] leading-tight text-faint">{i.muscles.slice(0, 2).join(" · ")}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* How to do the one she has picked, before she adds it. Choosing a
          movement she has never done from a name and a wireframe is a guess,
          and the guide this used to link to is part of the card now — which
          is no help at the moment of choosing. */}
      {picked && picked.formCues.length > 0 && (
        <div className="mt-2 rounded-xl border border-line bg-raised/50 p-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-widest text-faint">{picked.name}</p>
          <ol className="space-y-1 text-[12px] leading-relaxed text-muted">
            {picked.formCues.slice(0, 3).map((c, n) => (
              <li key={c} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-faint">{n + 1}</span>{c}
              </li>
            ))}
          </ol>
          {picked.safetyNote && (
            <p className="mt-2 rounded-lg border border-hold/40 bg-hold-soft px-2.5 py-1.5 text-[11px] leading-relaxed text-hold">
              {picked.safetyNote}
            </p>
          )}
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
