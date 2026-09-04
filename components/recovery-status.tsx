"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

const SYMPTOMS = [
  { key: "leaking", label: "Leaking when you cough, jump or lift" },
  { key: "heaviness", label: "Heaviness, dragging or bulging" },
  { key: "doming", label: "Tummy domes or tents in the middle" },
  { key: "pain", label: "Pain — pelvic, back or scar" },
  { key: "bleeding", label: "Bleeding that had stopped and came back" },
] as const;

/**
 * Telling the app where you are, and changing it as that changes.
 *
 * Deliberately editable from the screen as well as by asking: clearance
 * arrives on a specific day at a specific appointment, and symptoms come and
 * go. Making her explain it in a sentence every time is how the app ends up
 * with a stale answer, and a stale answer here decides which movements it
 * thinks are safe.
 */
export function RecoveryStatus() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [delivery, setDelivery] = useState<"vaginal" | "caesarean" | "">("");
  const [cleared, setCleared] = useState(false);
  const [breastfeeding, setBreastfeeding] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await action<{ ok?: boolean; error?: string }>("set_postpartum_status", {
        ...(birthDate ? { birthDate } : {}),
        ...(delivery ? { delivery } : {}),
        clearedForExercise: cleared,
        breastfeeding,
        symptoms,
      });
      if (res && res.ok === false) { setError(res.error ?? "That didn't save."); return; }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-line px-4 py-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-raised"
      >
        Update where you are
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <label className="block text-[12px] uppercase tracking-wide text-faint">When you gave birth</label>
      <input
        type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
        className="mt-1 w-full rounded-lg border border-edge bg-base px-3 py-2.5 text-[15px] focus:border-accent focus:outline-none"
      />

      <label className="mt-3 block text-[12px] uppercase tracking-wide text-faint">Birth</label>
      <div className="mt-1 flex gap-2">
        {(["vaginal", "caesarean"] as const).map((d) => (
          <button key={d} onClick={() => setDelivery(d)} aria-pressed={delivery === d}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] capitalize ${
              delivery === d ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
            }`}>{d}</button>
        ))}
      </div>

      <label className="mt-3 flex items-center gap-2.5 text-[14px]">
        <input type="checkbox" checked={cleared} onChange={(e) => setCleared(e.target.checked)}
          className="size-4 accent-[var(--color-accent)]" />
        A clinician has cleared me for exercise
      </label>
      <label className="mt-2 flex items-center gap-2.5 text-[14px]">
        <input type="checkbox" checked={breastfeeding} onChange={(e) => setBreastfeeding(e.target.checked)}
          className="size-4 accent-[var(--color-accent)]" />
        I&apos;m breastfeeding
      </label>

      <p className="mt-3 text-[12px] uppercase tracking-wide text-faint">Anything you have noticed</p>
      <div className="mt-1 space-y-1.5">
        {SYMPTOMS.map((s) => (
          <label key={s.key} className="flex items-start gap-2.5 text-[13px] leading-snug">
            <input
              type="checkbox"
              checked={symptoms.includes(s.key)}
              onChange={() => setSymptoms((cur) =>
                cur.includes(s.key) ? cur.filter((x) => x !== s.key) : [...cur, s.key])}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
            />
            {s.label}
          </label>
        ))}
      </div>

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={busy}
          className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy}
          className="rounded-xl border border-line px-4 py-2.5 text-[13px] text-muted disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
