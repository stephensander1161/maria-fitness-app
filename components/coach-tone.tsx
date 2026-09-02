"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * How the coach talks to her.
 *
 * Register only. Whichever she picks, it tells her the same truths about the
 * same numbers, works around the same pain and never treats a bad week as a
 * character flaw — the difference between an encouraging coach and a blunt one
 * is how it says a thing, not whether it says it.
 */
const TONES = [
  { value: "encouraging", label: "Encouraging", blurb: "Warm and steady. Leads with what went well." },
  { value: "plain", label: "Straight up", blurb: "Direct and short. What happened, what it means, what's next." },
  { value: "hype", label: "Gym bro", blurb: "Loud and blunt. Gym-floor energy, never at your expense." },
] as const;

type Tone = (typeof TONES)[number]["value"];

export function CoachTone({ tone }: { tone: Tone }) {
  const router = useRouter();
  const [saving, setSaving] = useState<Tone | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(next: Tone) {
    if (next === tone) return;
    setSaving(next);
    setError(null);
    try {
      await action("update_profile", { coachTone: next });
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <h2 className="text-[15px] font-semibold">How your coach talks</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Same coach, same honesty about the numbers — just a different voice. You can also
        say so: &ldquo;stop being so chirpy&rdquo; works.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {TONES.map((t) => {
          const on = t.value === tone;
          return (
            <button
              key={t.value}
              onClick={() => pick(t.value)}
              disabled={saving !== null}
              aria-pressed={on}
              className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                on ? "border-accent bg-accent-soft" : "border-line bg-base"
              }`}
            >
              <span className={`block text-[14px] font-medium ${on ? "text-accent" : "text-text"}`}>
                {t.label}
                {saving === t.value && <span className="ml-2 text-[12px] font-normal text-muted">saving…</span>}
              </span>
              <span className="mt-0.5 block text-[12px] text-muted">{t.blurb}</span>
            </button>
          );
        })}
      </div>

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}
