"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { NumberField } from "./number-field";
import { ExerciseFigure } from "./exercise-figure";
import type { PickableExercise } from "@/lib/views";

/**
 * Add one movement to today.
 *
 * It was a native dropdown, which on a hundred and sixty movements is a wheel
 * you scroll for a while looking for the word "core". A name alone also asks
 * her to know what a movement is before she picks it.
 *
 * So: pick the part of the body first — six chips, which is the question she
 * is actually asking — then choose from a grid of figures, where the shape of
 * the drawing says what the movement is before the name does.
 */
export function AddExercise({
  groups,
}: {
  groups: { group: string; items: PickableExercise[] }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState("");
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))), [groups]);
  const chosen = all.find((i) => i.slug === slug);

  // Typing beats tapping once she knows the name, so the search cuts across
  // every group rather than filtering within the chosen one.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return all.filter((i) =>
        i.name.toLowerCase().includes(q) || i.muscles.some((m) => m.includes(q)));
    }
    return group ? all.filter((i) => i.group === group) : [];
  }, [all, group, query]);

  async function add() {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      await action("add_exercise_to_day", { slug, sets, reps });
      close();
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setSlug("");
    setGroup(null);
    setQuery("");
    setError(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-line py-3.5 text-[14px] text-muted active:bg-surface"
      >
        + Add an exercise
      </button>
    );
  }

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movements…"
          aria-label="Search movements"
          className="min-w-0 flex-1 rounded-xl border border-edge bg-base px-3.5 py-2.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button onClick={close} className="shrink-0 px-2 py-2 text-[13px] text-muted">Cancel</button>
      </div>

      {/* The question she is actually asking, as six taps rather than a scroll. */}
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
              onClick={() => setSlug(i.slug)}
              aria-pressed={slug === i.slug}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                slug === i.slug
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-base hover:bg-raised"
              }`}
            >
              {/* The drawing says what it is before the name does. */}
              <ExerciseFigure
                slug={i.slug}
                category={i.category}
                className={`h-14 w-14 ${slug === i.slug ? "text-accent" : "text-muted"}`}
              />
              <span className={`text-[12px] leading-tight ${slug === i.slug ? "text-accent" : "text-text"}`}>
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
          Nothing matching that in your equipment. Ask your coach — it can add one.
        </p>
      )}

      {chosen && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Sets" value={sets} onChange={setSets} min={1} max={20} />
            <NumberField label="Reps" value={reps} onChange={setReps} min={1} max={200} />
          </div>

          {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}

          <button
            onClick={add}
            disabled={saving}
            className="w-full rounded-xl bg-accent py-3 text-[14px] font-semibold text-ink disabled:opacity-40"
          >
            {saving ? "Adding…" : `Add ${chosen.name} to today`}
          </button>
        </>
      )}

      {!chosen && error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
    </section>
  );
}
