"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * Whether one-sided movements ask which side a set was.
 *
 * Off by default: most people do left-then-right and count it as one set.
 * On for the person who wants the card to open on the side she did not do
 * last. Saved through update_profile, so "log my sides separately" to the
 * coach does the same thing.
 */
export function SidePickerSetting({ on }: { on: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function set(next: boolean) {
    setSaving(true); setError(null);
    try { await action("update_profile", { sidePicker: next }); router.refresh(); }
    catch (err) { setError(actionMessage(err, "That didn't save — try again.")); }
    finally { setSaving(false); }
  }
  return (
    <section className="card mb-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Left and right</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            On one-sided movements — lunges, single-arm rows — ask which side each set was. The card opens on the side you didn&apos;t do last.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={on} disabled={saving} onClick={() => void set(!on)}
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-accent" : "bg-raised border border-line"}`}>
          <span className={`absolute top-1 size-5 rounded-full bg-white transition-transform ${on ? "left-1 translate-x-5" : "left-1"}`} />
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}
