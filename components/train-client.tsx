"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { action } from "@/lib/client";
import type { TodayExercise, TodayView } from "@/lib/views";

type LogResult = { vsLastTime: "first" | "beat" | "matched" | "missed"; comparison: string };

const TONE = {
  beat: "border-beat/40 bg-beat-soft text-beat",
  matched: "border-hold/40 bg-hold-soft text-hold",
  missed: "border-miss/40 bg-miss-soft text-miss",
  first: "border-line bg-raised text-muted",
} as const;

export function TrainClient({ view }: { view: TodayView }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Record<string, LogResult>>({});
  const [finishing, setFinishing] = useState(false);
  const totalLogged = view.exercises.reduce((n, e) => n + e.loggedToday.length, 0);

  async function finish(feeling: number) {
    setFinishing(true);
    try {
      await action("finish_workout", { feeling });
      router.refresh();
    } finally {
      setFinishing(false);
    }
  }

  if (view.isRest) {
    return (
      <Empty title="Rest day" body="Recovery is when the adaptation actually happens. A walk or some mobility work is plenty." />
    );
  }
  if (!view.hasPlan || view.exercises.length === 0) {
    return (
      <Empty
        title="No workout planned"
        body="Ask your coach to build your week — it takes about a minute."
        cta
      />
    );
  }

  return (
    <div className="space-y-4">
      {view.exercises.map((ex) => (
        <ExerciseCard
          key={ex.slug}
          exercise={ex}
          unit={view.unit}
          result={feedback[ex.slug]}
          onLogged={(r) => { setFeedback((f) => ({ ...f, [ex.slug]: r })); router.refresh(); }}
        />
      ))}

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
      </div>
    </div>
  );
}

function ExerciseCard({
  exercise, unit, result, onLogged,
}: {
  exercise: TodayExercise; unit: string;
  result?: LogResult; onLogged: (r: LogResult) => void;
}) {
  const done = exercise.loggedToday;
  // Prefill from what she did on the last set today, else last session, else target.
  const seedWeight =
    done.at(-1)?.weight ?? exercise.lastTime?.sets.at(-1)?.weight ?? exercise.targetWeight ?? 0;
  const seedReps = done.at(-1)?.reps ?? exercise.targetReps;

  const [weight, setWeight] = useState(seedWeight);
  const [reps, setReps] = useState(seedReps);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function logSet() {
    setSaving(true);
    try {
      const r = await action<LogResult>("log_set", {
        exerciseSlug: exercise.slug,
        reps,
        weight: exercise.bodyweight ? null : weight,
      });
      onLogged(r);
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
        <Link
          href={`/learn/${exercise.slug}`}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12px] text-muted"
        >
          Form
        </Link>
      </div>

      {exercise.lastTime && (
        <p className="px-4 pb-3 text-[13px] text-muted tabular">
          <span className="text-faint">Last time · </span>
          {exercise.lastTime.sets
            .map((s) => `${s.reps}${s.weight !== null ? `@${s.weight}` : ""}`)
            .join("  ")}
        </p>
      )}

      {exercise.notes && <p className="px-4 pb-3 text-[13px] text-faint italic">{exercise.notes}</p>}

      {/* Set dots — a glance tells her how much is left. */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {Array.from({ length: Math.max(exercise.targetSets, done.length) }).map((_, i) => {
          const s = done[i];
          return (
            <div
              key={i}
              className={`flex h-9 min-w-11 items-center justify-center rounded-lg px-2 text-[12px] font-medium tabular ${
                s ? "bg-accent text-ink" : "border border-dashed border-line text-faint"
              }`}
            >
              {s ? `${s.reps}${s.weight !== null ? `×${s.weight}` : ""}` : "—"}
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
              {saving ? "Saving…" : `Log set ${done.length + 1}`}
            </button>
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
