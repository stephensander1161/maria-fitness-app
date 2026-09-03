"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { NumberField } from "./number-field";
import { MovementPicker } from "./movement-picker";
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
  groups, dayOfWeek, label,
}: {
  groups: { group: string; items: PickableExercise[] }[];
  /** 0=Monday. Omit for today, which is what the Train screen means. */
  dayOfWeek?: number;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const chosen = all.find((i) => i.slug === slug);

  async function add() {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      await action("add_exercise_to_day", {
        slug, sets, reps, ...(dayOfWeek === undefined ? {} : { dayOfWeek }),
      });
      close();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setSlug("");
    setError(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-line py-3.5 text-[14px] text-muted active:bg-surface"
      >
        {label ?? "+ Add an exercise"}
      </button>
    );
  }

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <MovementPicker groups={groups} value={slug} onPick={setSlug} />
        </div>
        <button onClick={close} className="shrink-0 px-2 py-2 text-[13px] text-muted">Cancel</button>
      </div>

      {chosen && (
        <>
          <p className="text-[12px] text-faint">
            What you are aiming for today. The card counts your sets against it, and you
            can log more or fewer — this is the target, not a limit.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Target sets" value={sets} onChange={setSets} min={1} max={20} />
            <NumberField label="Target reps" value={reps} onChange={setReps} min={1} max={200} />
          </div>

          {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}

          <button
            onClick={add}
            disabled={saving}
            className="w-full rounded-xl bg-accent py-3 text-[14px] font-semibold text-ink disabled:opacity-40"
          >
            {saving ? "Adding…" : `Add ${chosen.name}`}
          </button>
        </>
      )}

      {!chosen && error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
    </section>
  );
}
