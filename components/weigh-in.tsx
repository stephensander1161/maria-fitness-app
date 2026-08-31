"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";

export function WeighIn({ current, unit }: { current: number | null; unit: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? 150);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await action("log_weight", { weight: value });
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-line bg-raised py-3 text-[14px] font-medium text-muted active:bg-line">
        Log today&apos;s weigh-in
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center rounded-xl border border-line bg-surface">
        <button onClick={() => setValue((v) => Math.round((v - 0.2) * 10) / 10)}
          className="grid size-12 place-items-center text-xl text-muted" aria-label="Decrease">−</button>
        <span className="flex-1 text-center text-2xl font-semibold tabular">
          {value.toFixed(1)}<span className="ml-1 text-sm text-faint">{unit}</span>
        </span>
        <button onClick={() => setValue((v) => Math.round((v + 0.2) * 10) / 10)}
          className="grid size-12 place-items-center text-xl text-muted" aria-label="Increase">+</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setOpen(false)}
          className="rounded-xl border border-line py-3 text-[14px] text-muted">Cancel</button>
        <button onClick={save} disabled={saving}
          className="rounded-xl bg-accent py-3 text-[14px] font-semibold text-ink disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
