"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { action } from "@/lib/client";
import { AddExercise } from "./add-exercise";
import {
  logSetOrQueue, setInput, useFlushPendingSets, usePendingSets, type PendingSet,
} from "@/lib/offline";
import { RestTimerBar, unlockAudio, type Rest } from "@/components/rest-timer";
import type { TodayExercise, TodayView } from "@/lib/views";

type LogResult = { vsLastTime: "first" | "beat" | "matched" | "missed"; comparison: string };

const TONE = {
  beat: "border-beat/40 bg-beat-soft text-beat",
  matched: "border-hold/40 bg-hold-soft text-hold",
  missed: "border-miss/40 bg-miss-soft text-miss",
  first: "border-line bg-raised text-muted",
} as const;

const NO_PENDING: PendingSet[] = [];

export function TrainClient({ view, equipment }: { view: TodayView; equipment: string[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Record<string, LogResult>>({});
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);

  // Sets that failed to reach the server. They count as logged on screen —
  // she did the work, and the queue will deliver them.
  const pending = usePendingSets();
  const onFlushed = useCallback(() => router.refresh(), [router]);
  const flush = useFlushPendingSets(onFlushed);

  const pendingFor = useMemo(() => {
    const map = new Map<string, PendingSet[]>();
    for (const p of pending) {
      const list = map.get(p.input.exerciseSlug);
      if (list) list.push(p);
      else map.set(p.input.exerciseSlug, [p]);
    }
    return map;
  }, [pending]);

  const totalLogged =
    view.exercises.reduce((n, e) => n + e.loggedToday.length, 0) + pending.length;

  const startRest = useCallback((exercise: TodayExercise) => {
    if (exercise.restSeconds <= 0) return;
    setRest({
      slug: exercise.slug,
      name: exercise.name,
      // An absolute end time, so a throttled or sleeping tab cannot drift it.
      endsAt: Date.now() + exercise.restSeconds * 1000,
      seconds: exercise.restSeconds,
    });
  }, []);

  const extendRest = useCallback((seconds: number) => {
    setRest((r) =>
      r ? { ...r, endsAt: Math.max(r.endsAt, Date.now()) + seconds * 1000, seconds: r.seconds + seconds } : r,
    );
  }, []);
  const dismissRest = useCallback(() => setRest(null), []);

  async function finish(feeling: number) {
    setFinishing(true);
    setError(null);
    try {
      // Anything still queued belongs in this session's summary.
      await flush();
      await action("finish_workout", { feeling });
      setRest(null);
      router.refresh();
    } catch {
      setError("Couldn't close out the session — check your signal and try again.");
    } finally {
      setFinishing(false);
    }
  }

  if (view.isRest && view.exercises.length === 0) {
    return (
      <div className="space-y-4">
        <Empty title="Rest day" body="Recovery is when the adaptation actually happens. A walk or some mobility work is plenty." />
        <AddExercise equipment={equipment} />
      </div>
    );
  }
  if (!view.hasPlan || view.exercises.length === 0) {
    return (
      <div className="space-y-4">
        <Empty
          title="No workout planned"
          body="Ask your coach to build your week — it takes about a minute."
          cta
        />
        {view.hasPlan && <AddExercise equipment={equipment} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rest && <RestTimerBar rest={rest} onExtend={extendRest} onDismiss={dismissRest} />}

      {pending.length > 0 && <PendingBanner count={pending.length} onRetry={flush} />}

      {view.exercises.map((ex) => (
        <ExerciseCard
          key={ex.slug}
          exercise={ex}
          unit={view.unit}
          result={feedback[ex.slug]}
          pending={pendingFor.get(ex.slug) ?? NO_PENDING}
          onLogged={(r) => {
            if (r) setFeedback((f) => ({ ...f, [ex.slug]: r }));
            startRest(ex);
            // Nothing new to fetch while the set is sitting in the outbox, and
            // a refresh with no signal just hangs.
            if (r) router.refresh();
          }}
          onRetryPending={flush}
          onRemoved={() => router.refresh()}
        />
      ))}

      <AddExercise equipment={equipment} />

      <div className="card p-4">
        {view.completed ? (
          <p className="text-center text-sm text-beat">Session complete. Nice work.</p>
        ) : (
          <>
            <p className="mb-3 text-center text-sm text-muted">
              {totalLogged === 0 ? "Log a set to get going." : `${totalLogged} sets logged — how did it feel?`}
            </p>
            <div className="grid grid-cols-5 gap-2">
              {["Brutal", "Hard", "Solid", "Good", "Easy"].map((label, i) => (
                <button
                  key={label}
                  disabled={totalLogged === 0 || finishing}
                  onClick={() => finish(i + 1)}
                  className="rounded-xl border border-line bg-raised py-2.5 text-[11px] font-medium text-muted active:bg-line disabled:opacity-30"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        {error && <p className="mt-3 text-center text-[13px] text-miss">{error}</p>}
      </div>
    </div>
  );
}

/** "N sets pending" — the whole point is that she can see nothing was lost. */
function PendingBanner({ count, onRetry }: { count: number; onRetry: () => void }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <button
      onClick={() => onRetry()}
      className="flex w-full items-center gap-3 rounded-xl border border-hold/30 bg-hold-soft px-3 py-2.5 text-left"
    >
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-hold" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-hold tabular">
          {count} set{count === 1 ? "" : "s"} pending
        </span>
        <span className="block text-[12px] text-hold/70">
          {online ? "Saving…" : "Saved on your phone — they'll go up when you have signal."}
        </span>
      </span>
      <span className="shrink-0 text-[12px] font-semibold text-hold">Retry</span>
    </button>
  );
}

/**
 * Three identical sets read better as "3×8 @ 65lb" than as "8@65 8@65 8@65" —
 * and it matches how the target directly above it is written.
 */
function summariseSets(sets: { reps: number; weight: number | null }[], unit: string): string {
  if (sets.length === 0) return "—";
  const [first] = sets;
  const uniform = sets.every((s) => s.reps === first.reps && s.weight === first.weight);
  if (uniform) {
    return `${sets.length}×${first.reps}${first.weight !== null ? ` @ ${first.weight}${unit}` : ""}`;
  }
  return sets.map((s) => `${s.reps}${s.weight !== null ? `@${s.weight}` : ""}`).join("  ");
}

function ExerciseCard({
  exercise, unit, result, pending, onLogged, onRetryPending, onRemoved,
}: {
  exercise: TodayExercise; unit: string;
  result?: LogResult; pending: PendingSet[];
  onLogged: (r: LogResult | null) => void;
  onRetryPending: () => void;
  onRemoved: () => void;
}) {
  const done = exercise.loggedToday;
  const queued = pending.map((p) => ({ reps: p.input.reps, weight: p.input.weight }));
  // Prefill from what she did on the last set today — including one still in
  // the outbox — else last session, else target.
  const seedWeight =
    queued.at(-1)?.weight ?? done.at(-1)?.weight ??
    exercise.lastTime?.sets.at(-1)?.weight ?? exercise.targetWeight ?? 0;
  const seedReps = queued.at(-1)?.reps ?? done.at(-1)?.reps ?? exercise.targetReps;

  const [weight, setWeight] = useState(seedWeight);
  const [reps, setReps] = useState(seedReps);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const setCount = done.length + queued.length;

  async function removeFromToday() {
    setRemoving(true);
    try {
      await action("remove_exercise_from_day", { slug: exercise.slug });
      onRemoved();
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  async function logSet() {
    setSaving(true);
    setError(null);
    // Her tap is the gesture iOS requires before the rest beep can ever sound.
    unlockAudio();
    try {
      const outcome = await logSetOrQueue<LogResult>(
        setInput(exercise.slug, reps, exercise.bodyweight ? null : weight),
      );
      onLogged(outcome.result);
      // A good call is also the moment to drain anything stuck from earlier.
      if (!outcome.queued) onRetryPending();
    } catch {
      setError("That didn't save — tap to try again.");
    } finally {
      setSaving(false);
    }
  }

  const step = weight >= 100 ? 5 : weight >= 20 ? 2.5 : 1;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-semibold">{exercise.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted tabular">
            Target {exercise.targetSets}×{exercise.targetReps}
            {exercise.targetWeight !== null && ` @ ${exercise.targetWeight}${unit}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {exercise.extra && (
            <span className="rounded-full bg-raised px-2.5 py-1 text-[11px] text-faint">Added</span>
          )}
          <Link
            href={`/learn/${exercise.slug}`}
            className="rounded-full border border-line px-3 py-1.5 text-[12px] text-muted"
          >
            Form
          </Link>
          {/* Extras aren't on the plan, so there is nothing to remove them from. */}
          {!exercise.extra && (
            <button
              onClick={() => setConfirmRemove(!confirmRemove)}
              aria-label={`Remove ${exercise.name} from today`}
              className="grid size-8 place-items-center rounded-full border border-line text-muted"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {confirmRemove && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2">
          <p className="flex-1 text-[12px] text-muted">
            {setCount > 0 ? "Remove from today's plan? Your logged sets stay." : "Remove from today?"}
          </p>
          <button onClick={() => setConfirmRemove(false)} className="text-[12px] text-muted">Keep</button>
          <button onClick={removeFromToday} disabled={removing}
            className="text-[12px] font-medium text-miss disabled:opacity-50">
            {removing ? "…" : "Remove"}
          </button>
        </div>
      )}

      {exercise.lastTime && (
        <p className="px-4 pb-3 text-[13px] text-muted tabular">
          <span className="text-faint">Last time · </span>
          {summariseSets(exercise.lastTime.sets, unit)}
        </p>
      )}

      {exercise.notes && <p className="px-4 pb-3 text-[13px] text-faint italic">{exercise.notes}</p>}

      {/* Set dots — a glance tells her how much is left. A dot for a queued set
          looks logged, because it is; the outline says it hasn't gone up yet. */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {Array.from({ length: Math.max(exercise.targetSets, setCount) }).map((_, i) => {
          const s = done[i] ?? queued[i - done.length];
          const isQueued = i >= done.length && i < setCount;
          return (
            <div
              key={i}
              className={`flex h-9 min-w-11 items-center justify-center rounded-lg px-2 text-[12px] font-medium tabular ${
                isQueued
                  ? "border border-dashed border-accent bg-accent-soft text-accent"
                  : s
                    ? "bg-accent text-ink"
                    : "border border-dashed border-line text-faint"
              }`}
            >
              {s ? `${s.reps}${s.weight !== null ? `@${s.weight}` : ""}` : "—"}
            </div>
          );
        })}
      </div>

      {result && (
        <p className={`mx-4 mb-3 rounded-xl border px-3 py-2 text-[13px] ${TONE[result.vsLastTime]}`}>
          {result.comparison}
        </p>
      )}

      <div className="border-t border-line bg-ink/40 p-3">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="w-full rounded-xl bg-raised py-3 text-[15px] font-medium text-text active:bg-line"
          >
            Log a set
          </button>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {!exercise.bodyweight && (
                <Stepper label={`Weight (${unit})`} value={weight} step={step}
                  onChange={(v) => setWeight(Math.max(0, v))} />
              )}
              <Stepper label="Reps" value={reps} step={1}
                onChange={(v) => setReps(Math.max(1, v))}
                className={exercise.bodyweight ? "col-span-2" : ""} />
            </div>
            <button
              onClick={logSet}
              disabled={saving}
              className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-ink active:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving…" : `Log set ${setCount + 1}`}
            </button>
            {error && <p className="text-center text-[13px] text-miss">{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function Stepper({
  label, value, step, onChange, className = "",
}: {
  label: string; value: number; step: number;
  onChange: (v: number) => void; className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-center text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <div className="flex items-center rounded-xl border border-line bg-surface">
        <button onClick={() => onChange(value - step)}
          className="grid size-12 place-items-center text-xl text-muted active:text-accent" aria-label="Decrease">−</button>
        <span className="flex-1 text-center text-xl font-semibold tabular">{value}</span>
        <button onClick={() => onChange(value + step)}
          className="grid size-12 place-items-center text-xl text-muted active:text-accent" aria-label="Increase">+</button>
      </div>
    </div>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: boolean }) {
  return (
    <div className="card mt-6 p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{body}</p>
      {cta && (
        <Link href="/" className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink">
          Talk to your coach
        </Link>
      )}
    </div>
  );
}
