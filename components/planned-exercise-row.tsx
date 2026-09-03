"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * One movement on a day of the plan that is not today.
 *
 * Today's movements are the Train screen's own cards, because on the day it
 * is a session rather than a plan. This is the other case: something she can
 * read, look up, or take off the day.
 */
export function PlannedExerciseRow({
  slug, name, target, dayOfWeek,
}: {
  slug: string; name: string; target: string; dayOfWeek: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await action("remove_exercise_from_day", { slug, dayOfWeek });
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "Couldn't take that off the day."));
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line/60 py-2.5 last:border-0">
      <div className="flex items-baseline gap-3">
        <Link href={`/learn/${slug}`} className="min-w-0 flex-1 truncate text-[15px] hover:text-accent">
          {name}
        </Link>
        <span className="shrink-0 text-[13px] text-muted tabular">{target}</span>
        <button
          onClick={remove}
          disabled={busy}
          aria-label={`Take ${name} off this day`}
          className="-my-1 grid size-7 shrink-0 place-items-center rounded-full text-faint hover:bg-raised hover:text-miss disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-[12px] text-miss">{error}</p>}
    </div>
  );
}
