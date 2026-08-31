"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";

type Found = {
  slug: string; name: string; category: string;
  primaryMuscles: string[]; equipment: string[]; bodyweight: boolean;
};

/**
 * Adds one movement to today without rebuilding the week. Everything here goes
 * through the same tools the coach uses, so "throw in some curls" and tapping
 * this button do exactly the same thing.
 */
export function AddExercise({ equipment }: { equipment: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [picked, setPicked] = useState<Found | null>(null);
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState(true);

  useEffect(() => {
    if (!open || picked) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const found = await action<Found[]>("search_exercises", {
        query: query.trim() || undefined,
        // Default to what she actually owns; most searches shouldn't surface a
        // cable machine she has no access to.
        equipment: mine && equipment.length ? equipment[0] : undefined,
        limit: 30,
      }).catch(() => []);
      if (!cancelled) setResults(found);
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, query, picked, mine, equipment]);

  async function add() {
    if (!picked) return;
    setSaving(true);
    try {
      await action("add_exercise_to_day", { slug: picked.slug, sets, reps });
      reset();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setOpen(false); setPicked(null); setQuery(""); setResults([]);
    setSets(3); setReps(10);
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
    <section className="card p-4">
      {picked ? (
        <>
          <p className="text-[15px] font-semibold">{picked.name}</p>
          <p className="mb-3 text-[12px] text-faint">{picked.primaryMuscles.join(" · ")}</p>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Stepper label="Sets" value={sets} onChange={(v) => setSets(Math.max(1, v))} />
            <Stepper label="Reps" value={reps} onChange={(v) => setReps(Math.max(1, v))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPicked(null)}
              className="rounded-xl border border-line py-3 text-[14px] text-muted">Back</button>
            <button onClick={add} disabled={saving}
              className="rounded-xl bg-accent py-3 text-[14px] font-semibold text-ink disabled:opacity-50">
              {saving ? "Adding…" : "Add to today"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movements…"
              autoFocus
              className="flex-1 rounded-xl border border-line bg-base px-3.5 py-2.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button onClick={reset} className="px-1 text-[13px] text-muted">Cancel</button>
          </div>

          {equipment.length > 0 && (
            <button
              onClick={() => setMine(!mine)}
              className={`mb-2 rounded-full border px-3 py-1.5 text-[12px] ${
                mine ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
              }`}
            >
              {mine ? `Only my ${equipment[0]}` : "Everything"}
            </button>
          )}

          <div className="max-h-72 overflow-y-auto">
            {results.map((r) => (
              <button key={r.slug} onClick={() => setPicked(r)}
                className="flex w-full items-center justify-between gap-3 border-b border-line/60 py-2.5 text-left last:border-0">
                <span className="min-w-0">
                  <span className="block truncate text-[14px]">{r.name}</span>
                  <span className="block truncate text-[11px] text-faint">{r.primaryMuscles.join(" · ")}</span>
                </span>
                <span className="shrink-0 text-[18px] leading-none text-accent">+</span>
              </button>
            ))}
            {results.length === 0 && (
              <p className="py-6 text-center text-[13px] text-faint">Nothing matches that.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-center text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <div className="flex items-center rounded-xl border border-line bg-surface">
        <button onClick={() => onChange(value - 1)} className="grid size-11 place-items-center text-xl text-muted">−</button>
        <span className="flex-1 text-center text-lg font-semibold tabular">{value}</span>
        <button onClick={() => onChange(value + 1)} className="grid size-11 place-items-center text-xl text-muted">+</button>
      </div>
    </div>
  );
}
