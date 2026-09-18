"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { COACH_NAME_MAX, coachNameOf, DEFAULT_COACH_NAME } from "@/lib/coach-name";

/**
 * What she calls her coach.
 *
 * Asked once at onboarding, and this is where it changes. Saved through
 * update_profile, the same way asking would be — "call yourself Bertha" —
 * and the page re-reads itself so every button that names the coach follows.
 */
export function CoachName({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name === DEFAULT_COACH_NAME ? "" : name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = coachNameOf(value) !== name;

  async function save() {
    if (!changed) return;
    setSaving(true);
    setError(null);
    try {
      await action("update_profile", { coachName: value });
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <h2 className="text-[15px] font-semibold">Your coach&apos;s name</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Every button that says &ldquo;Ask {name}&rdquo; follows it. Leave it empty for plain &ldquo;Coach&rdquo;.
      </p>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={DEFAULT_COACH_NAME}
          maxLength={COACH_NAME_MAX}
          aria-label="What to call your coach"
          className="min-w-0 flex-1 rounded-xl border border-line bg-base px-4 py-3 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!changed || saving}
          className="rounded-xl bg-accent px-4 py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}
