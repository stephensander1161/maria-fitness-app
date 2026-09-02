"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";
import { NumberField } from "./number-field";
import type { PickableExercise } from "@/lib/views";

/**
 * Add one movement to today.
 *
 * A grouped dropdown rather than a search box: the list is loaded with the page,
 * so there is nothing to wait for and nothing to type, and she can see what
 * exists instead of having to guess a name. It only contains movements her
 * equipment allows, which is why there is no filter — the filter would be
 * "show me things I can't do".
 */
export function AddExercise({
  groups,
}: {
  groups: { group: string; items: PickableExercise[] }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = groups.flatMap((g) => g.items).find((i) => i.slug === slug);

  async function add() {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      await action("add_exercise_to_day", { slug, sets, reps });
      setOpen(false);
      setSlug("");
      router.refresh();
    } catch {
      setError("That didn't save — try again.");
    } finally {
      setSaving(false);
    }
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
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Movement</p>
        <div className="relative">
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            aria-label="Choose a movement"
            // appearance-none so the native arrow doesn't fight the dark theme;
            // the select itself stays native, which on iOS is the wheel picker.
            className="w-full appearance-none rounded-xl border border-line bg-surface px-4 py-3.5 pr-10 text-[16px] focus:border-accent focus:outline-none"
          >
            <option value="">Choose a movement…</option>
            {groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((i) => (
                  <option key={i.slug} value={i.slug}>{i.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <svg
            aria-hidden
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-faint"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      {chosen && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Sets" value={sets} onChange={setSets} min={1} max={20} />
          <NumberField label="Reps" value={reps} onChange={setReps} min={1} max={200} />
        </div>
      )}

      {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setOpen(false); setSlug(""); setError(null); }}
          className="rounded-xl border border-line py-3 text-[14px] text-muted"
        >
          Cancel
        </button>
        <button
          onClick={add}
          disabled={saving || !slug}
          className="rounded-xl bg-accent py-3 text-[14px] font-semibold text-ink disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add to today"}
        </button>
      </div>
    </section>
  );
}
