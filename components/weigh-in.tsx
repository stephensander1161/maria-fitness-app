"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";
import { NumberField } from "./number-field";

/**
 * The first thing on the Progress screen, above the fold.
 *
 * It used to sit under the sparkline, which meant scrolling the whole screen to
 * do the one thing she opens it for. Collapsed it is a single row; open, it is
 * a stepper and a save — the weight is always in her display units, converted
 * at the tool boundary.
 */
export function WeighIn({
  current, unit, loggedToday,
}: {
  current: number | null;
  unit: string;
  loggedToday: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? 150);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await action("log_weight", { weight: value });
      setOpen(false);
      router.refresh();
    } catch {
      setError("That didn't save — check your signal and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <section className="card mb-3 flex items-center gap-3 p-3 pl-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-faint">Today</p>
          <p className="text-[13px] text-muted tabular">
            {loggedToday && current !== null
              ? `Weighed in at ${current} ${unit}`
              : "No weigh-in yet"}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-[14px] font-semibold ${
            loggedToday
              ? "border border-line bg-raised text-muted active:bg-line"
              : "bg-accent text-ink active:opacity-80"
          }`}
        >
          {loggedToday ? "Update" : "Weigh in"}
        </button>
      </section>
    );
  }

  return (
    <section className="card mb-3 space-y-3 p-3">
      <NumberField
        value={value}
        onChange={setValue}
        step={0.2}
        min={30}
        max={700}
        decimals
        suffix={unit}
        label="Weight"
      />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setOpen(false); setError(null); }}
          className="rounded-xl border border-line py-3 text-[14px] text-muted">Cancel</button>
        <button onClick={save} disabled={saving}
          className="rounded-xl bg-accent py-3 text-[14px] font-semibold text-ink disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="text-center text-[13px] text-miss">{error}</p>}
    </section>
  );
}
