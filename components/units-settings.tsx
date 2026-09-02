"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import type { Units } from "@/lib/units";

/**
 * Two switches, because they are two habits. A bathroom scale in pounds says
 * nothing about the kitchen scale, so the body and the kitchen are set apart —
 * the kitchen follows the body until she picks for it. Nothing stored changes
 * either way; only how the numbers read back.
 */
export function UnitsSettings({ units, foodUnits }: { units: Units; foodUnits: Units | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState<"units" | "foodUnits" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { units: Units } | { foodUnits: Units | "same" }) {
    setSaving("units" in patch ? "units" : "foodUnits");
    setError(null);
    try {
      await action("update_profile", patch);
      router.refresh();
    } catch (err) {
      // A unit she believes she switched, and did not, mislabels every number
      // she reads from then on.
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setSaving(null);
    }
  }

  const kitchen = foodUnits ?? units;

  return (
    <section className="card mb-3 p-5">
      <h2 className="text-[15px] font-semibold">Units</h2>

      <Row label="Scale, tape & height" busy={saving === "units"}>
        <Segment options={[["imperial", "lb · in"], ["metric", "kg · cm"]]} value={units}
          onPick={(v) => save({ units: v })} />
      </Row>

      <Row label="Kitchen" busy={saving === "foodUnits"}>
        <Segment options={[["imperial", "oz · cups · °F"], ["metric", "g · ml · °C"]]} value={kitchen}
          onPick={(v) => save({ foodUnits: v })} />
      </Row>
      <p className="mt-2 text-[12px] text-faint">
        {foodUnits === null
          ? "The kitchen follows the scale. Pick one above to set it separately."
          : <>Set separately. <button onClick={() => save({ foodUnits: "same" })} className="underline">Follow the scale again</button></>}
      </p>

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}

function Row({ label, busy, children }: { label: string; busy: boolean; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-[13px] text-muted">{label}</p>
      <div className={busy ? "opacity-50" : ""}>{children}</div>
    </div>
  );
}

function Segment({ options, value, onPick }: {
  options: [Units, string][]; value: Units; onPick: (v: Units) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => v !== value && onPick(v)} role="radio" aria-checked={v === value}
          className={`min-h-9 whitespace-nowrap rounded-full px-3 text-[12px] font-medium transition-colors ${
            v === value ? "bg-accent text-ink" : "text-muted"
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}
