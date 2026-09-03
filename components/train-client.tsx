"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { AddExercise } from "./add-exercise";
import { AskCoach } from "./ask-coach";
import { NumberField } from "./number-field";
import { FormGuide } from "./form-guide";
import {
  logSetOrQueue, setInput, useFlushPendingSets, usePendingSets, type PendingSet,
} from "@/lib/offline";
import { askToNotify, unlockAudio } from "@/components/rest-timer";
import { useRest } from "@/components/rest-provider";
import type { PickableExercise, TodayExercise, TodayView } from "@/lib/views";

type LogResult = { vsLastTime: "first" | "beat" | "matched" | "missed"; comparison: string };

const TONE = {
  beat: "border-beat/40 bg-beat-soft text-beat",
  matched: "border-hold/40 bg-hold-soft text-hold",
  missed: "border-miss/40 bg-miss-soft text-miss",
  first: "border-line bg-raised text-muted",
} as const;

const NO_PENDING: PendingSet[] = [];

/** What lib/progression-math worked out for one movement. */
export type NextTarget = {
  slug: string;
  target: { sets: number; reps: number; weight: number | null; unit: string };
  change: "up" | "reps" | "hold" | "down" | "first-time";
  why: string;
  warmup: { weight: number | null; reps: number; unit: string }[];
};

export function TrainClient({
  view,
  pickable,
  targets = [],
}: {
  view: TodayView;
  pickable: { group: string; items: PickableExercise[] }[];
  targets?: NextTarget[];
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Record<string, LogResult>>({});
  const [finishing, setFinishing] = useState(false);
  const [finishEarly, setFinishEarly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The countdown lives above the router now, so it keeps running when she
  // wanders off to the food screen mid-rest.
  const { start: beginRest, dismiss: dismissRest } = useRest();

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
  // Movements that still have sets left in them. "Complete" has to mean
  // every one is done, or adding an exercise after signing off leaves the
  // card claiming the session is finished when it plainly isn't.
  const outstanding = view.exercises
    .filter((e) => e.targetSets > 0 && e.loggedToday.length < e.targetSets)
    .map((e) => e.name);

  const startRest = useCallback((exercise: TodayExercise) => {
    beginRest({
      slug: exercise.slug,
      name: exercise.name,
      category: exercise.category,
      // An absolute end time, so a throttled or sleeping tab cannot drift it.
      endsAt: Date.now() + exercise.restSeconds * 1000,
      seconds: exercise.restSeconds,
    });
  }, [beginRest]);

  /**
   * Finishing is one button now.
   *
   * It used to be five — Brutal to Easy — asking how the session felt. Reps in
   * reserve per set answers the same question better and is already being
   * collected one tap at a time, so the five-way was a second, coarser copy of
   * a signal we have. The coach can still ask in words when it matters, and
   * finish_workout still takes a feeling when she gives one.
   */
  async function finish(feeling?: number) {
    setFinishing(true);
    setError(null);
    try {
      // Anything still queued belongs in this session's summary.
      await flush();
      await action("finish_workout", feeling === undefined ? {} : { feeling });
      dismissRest();
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
        <AddExercise groups={pickable} />
      </div>
    );
  }
  if (!view.hasPlan || view.exercises.length === 0) {
    return (
      <div className="space-y-4">
        <Empty
          title="No workout planned"
          body="Ask your coach to build your week — it takes about a minute."
        />
        <AskCoach
          title="Ask your coach"
          hint="It builds the week here"
          placeholder="Tell your coach what you want…"
          suggestions={[
            "Build my week",
            "I've only got three days this week",
            "What should I do today?",
          ]}
        />
        {view.hasPlan && <AddExercise groups={pickable} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && <PendingBanner count={pending.length} onRetry={flush} />}

      {/*
        One card at a time under a thumb; two columns where there is room.
        A grid rather than a flowed column: a card grows when she opens the
        stepper, and in a flow that would shove every later card sideways.
      */}
      <div className="space-y-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0 xl:[&>*]:mb-4">
      {view.exercises.map((ex) => (
        <ExerciseCard
          key={ex.slug}
          exercise={ex}
          unit={view.unit}
          next={targets.find((t) => t.slug === ex.slug)}
          result={feedback[ex.slug]}
          pending={pendingFor.get(ex.slug) ?? NO_PENDING}
          onLogged={(r, finishedExercise) => {
            if (r) setFeedback((f) => ({ ...f, [ex.slug]: r }));
            // Rest runs between sets *and* between movements — finishing the
            // squats is exactly when she needs a minute before the next thing.
            // The only set with nothing to recover for is the last one of the
            // session, and that is the one that stops the timer.
            const wasLastOfSession = finishedExercise
              && outstanding.filter((name) => name !== ex.name).length === 0;
            if (wasLastOfSession) dismissRest();
            else startRest(ex);
            // Nothing new to fetch while the set is sitting in the outbox, and
            // a refresh with no signal just hangs.
            if (r) router.refresh();
          }}
          onRetryPending={flush}
          onRemoved={() => router.refresh()}
        />
      ))}
      </div>

      <AddExercise groups={pickable} />

      {/*
        Finishing is offered when there is a session to finish, not while she
        is mid-way through one. Five big buttons under a half-done workout is
        an invitation to end it by accident — which is what happened: a tap
        closed the session, stopped the rest timer, and collapsed the sets she
        was still entering.
      */}
      <div className="card p-4">
        {view.completed && outstanding.length === 0 ? (
          <p className="text-center text-sm text-beat">Session complete. Nice work.</p>
        ) : totalLogged === 0 ? (
          <p className="text-center text-sm text-muted">Log a set to get going.</p>
        ) : outstanding.length > 0 ? (
          <div className="text-center">
            <p className="text-sm text-muted">Still to do: {outstanding.join(", ")}</p>
            {/* Stopping early is hers to choose — it is just not the biggest
                thing on the screen while there is work left. */}
            {finishEarly ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                <button onClick={() => void finish()} disabled={finishing}
                  className="rounded-xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50">
                  {finishing ? "Finishing…" : "Finish session"}
                </button>
                <button onClick={() => setFinishEarly(false)}
                  className="px-3 py-2.5 text-[12px] text-faint">
                  Keep going
                </button>
              </div>
            ) : (
              <button
                onClick={() => setFinishEarly(true)}
                className="-mb-1 mt-2 px-3 py-2 text-[12px] text-faint underline underline-offset-2 hover:text-muted"
              >
                Finish early
              </button>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-3 text-sm text-muted">{totalLogged} sets logged.</p>
            <button onClick={() => void finish()} disabled={finishing}
              className="rounded-xl bg-accent px-6 py-3 text-[14px] font-semibold text-ink disabled:opacity-50">
              {finishing ? "Finishing…" : "Finish session"}
            </button>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-center text-[13px] text-miss">{error}</p>}
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
 * Correcting a set she has already logged.
 *
 * "That was 45, not 55" used to be something only the coach could do, and only
 * if she thought to ask. A number she can see and cannot fix is a number she
 * stops trusting — and a wrong set skews the comparison to last time, the
 * progression and the next prescription until it is right.
 */
function SetEditor({
  slug, setNumber, set, unit, bodyweight, onDone, onCancel,
}: {
  slug: string;
  setNumber: number;
  set: { reps: number; weight: number | null };
  unit: string;
  bodyweight: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reps, setReps] = useState(set.reps);
  const [weight, setWeight] = useState(set.weight ?? 0);
  // A bodyweight movement she logged with a weight is still a weighted set —
  // the editor has to be able to show and change that number, or correcting
  // the reps silently throws the weight away.
  const [addWeight, setAddWeight] = useState(false);
  const loaded = !bodyweight || addWeight || set.weight !== null;
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "save" | "delete") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "delete") {
        await action("delete_set", { exerciseSlug: slug, setNumber });
      } else {
        await action("correct_set", {
          exerciseSlug: slug, setNumber, reps,
          ...(loaded ? { weight } : {}),
        });
      }
      onDone();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
      setBusy(null);
    }
  }

  const step = weight >= 100 ? 5 : weight >= 20 ? 2.5 : 1;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-line bg-raised p-3">
      <p className="mb-2 text-[12px] text-muted">Set {setNumber}</p>
      <div className={`grid gap-2 ${loaded ? "grid-cols-2" : "grid-cols-1"}`}>
        {loaded && (
          <NumberField label={`Weight (${unit})`} value={weight} step={step} min={0} max={2000}
            onChange={setWeight} />
        )}
        <NumberField label="Reps" value={reps} step={1} decimals min={0.5} max={500} onChange={setReps} />
      </div>
      {!loaded && (
        <button
          onClick={() => setAddWeight(true)}
          className="mt-2 text-[12px] text-faint active:text-muted"
        >
          + Add a weight
        </button>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => run("save")} disabled={busy !== null}
          className="flex-1 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50">
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} disabled={busy !== null}
          className="rounded-xl border border-line px-3 py-2.5 text-[13px] text-muted disabled:opacity-50">
          Cancel
        </button>
        <button onClick={() => run("delete")} disabled={busy !== null}
          className="rounded-xl border border-miss/40 px-3 py-2.5 text-[13px] text-miss disabled:opacity-50">
          {busy === "delete" ? "…" : "Delete"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
    </div>
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
  exercise, unit, next, result, pending, onLogged, onRetryPending, onRemoved,
}: {
  exercise: TodayExercise; unit: string; next?: NextTarget;
  result?: LogResult; pending: PendingSet[];
  onLogged: (r: LogResult | null, finishedExercise: boolean) => void;
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editingSet, setEditingSet] = useState<number | null>(null);
  /**
   * She is holding something for a movement the library calls bodyweight.
   *
   * Weighted V-ups, a dumbbell held through a Russian twist, a plate on a
   * push-up — the loaded variation is the *same movement*, and hiding the
   * weight field forces her to either log a lie or give up the number. It
   * starts hidden because most people do these empty-handed, and stays put
   * once she has said otherwise: a set already logged with a weight means the
   * question is settled for today.
   */
  const [addWeight, setAddWeight] = useState(false);
  const loaded = !exercise.bodyweight
    || addWeight
    || done.some((s) => s.weight !== null)
    || queued.some((s) => s.weight !== null);

  const setCount = done.length + queued.length;
  const targetMet = exercise.targetSets > 0 && setCount >= exercise.targetSets;
  const todayVolume = Math.round(
    [...done, ...queued].reduce((n, s) => n + (s.weight ?? 0) * s.reps, 0),
  );

  async function removeFromToday() {
    setRemoving(true);
    setError(null);
    try {
      await action("remove_exercise_from_day", { slug: exercise.slug });
      onRemoved();
      setConfirmRemove(false);
    } catch (err) {
      // The confirm bar used to close in a `finally` whatever happened: she
      // tapped Remove, the bar vanished, the exercise stayed, and nothing ever
      // said why.
      setError(actionMessage(err, "Couldn't take that off today."));
    } finally {
      setRemoving(false);
    }
  }

  async function logSet(rir?: number) {
    setSaving(true);
    setError(null);
    // Her tap is the gesture iOS requires before the rest beep can ever sound,
    // and the only moment a browser will entertain a notification prompt.
    unlockAudio();
    askToNotify();
    try {
      const outcome = await logSetOrQueue<LogResult>(
        setInput(exercise.slug, reps, loaded ? weight : null, rir),
      );
      // Whether that was the last set she planned for this movement.
      onLogged(outcome.result, exercise.targetSets > 0 && setCount + 1 >= exercise.targetSets);
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
          {/* The computed target where there is one — worked out from what she
              actually logged, not re-derived by the model each week. Labelled
              as a target, because a target read as an achievement is a bug
              this app has had before. */}
          <p className="mt-0.5 text-[13px] text-muted tabular">
            Target {next ? next.target.sets : exercise.targetSets}×{next ? next.target.reps : exercise.targetReps}
            {(next ? next.target.weight : exercise.targetWeight) !== null &&
              ` @ ${next ? next.target.weight : exercise.targetWeight}${unit}`}
          </p>
          {next && next.change === "up" && (
            <p className="mt-1 text-[12px] text-beat">Up from last time</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {done.length >= exercise.targetSets && exercise.targetSets > 0 && (
            <span className="grid size-6 place-items-center rounded-full bg-beat text-[12px] text-ink"
              aria-label="Target sets complete">✓</span>
          )}
          {exercise.extra && (
            <span className="rounded-full bg-raised px-2.5 py-1 text-[11px] text-faint">Added</span>
          )}
          <button
            onClick={() => setGuideOpen(true)}
            aria-label={`How to do ${exercise.name}`}
            className="grid size-8 place-items-center rounded-full border border-line text-muted"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.5" />
              <path d="M12 17h.01" />
            </svg>
          </button>
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
          <button onClick={() => setConfirmRemove(false)} className="-my-1 px-2.5 py-2.5 text-[12px] text-muted">Keep</button>
          <button onClick={removeFromToday} disabled={removing}
            className="-my-1 px-2.5 py-2.5 text-[12px] font-medium text-miss disabled:opacity-50">
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
          looks logged, because it is; the outline says it hasn't gone up yet.
          A logged one is a button: a mistyped set was permanent until now. */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {Array.from({ length: Math.max(exercise.targetSets, setCount) }).map((_, i) => {
          const s = done[i] ?? queued[i - done.length];
          const isQueued = i >= done.length && i < setCount;
          const label = s ? `${s.reps}${s.weight !== null ? `@${s.weight}` : ""}` : "—";
          const shape = `flex h-9 min-w-11 items-center justify-center rounded-lg px-2 text-[12px] font-medium tabular ${
            isQueued
              ? "border border-dashed border-accent bg-accent-soft text-accent"
              : s
                ? "bg-accent text-ink"
                : "border border-dashed border-edge text-faint"
          }`;

          // Only a set that has actually landed can be corrected — one still
          // in the outbox has no row to correct yet.
          if (!s || isQueued) return <div key={i} className={shape}>{label}</div>;
          return (
            <button
              key={i}
              onClick={() => setEditingSet(editingSet === i + 1 ? null : i + 1)}
              aria-label={`Edit set ${i + 1}: ${label}`}
              className={`${shape} transition-opacity hover:opacity-80 ${
                editingSet === i + 1 ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : ""
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {editingSet !== null && done[editingSet - 1] && (
        <SetEditor
          slug={exercise.slug}
          setNumber={editingSet}
          set={done[editingSet - 1]}
          unit={unit}
          bodyweight={exercise.bodyweight}
          onDone={() => { setEditingSet(null); onRemoved(); }}
          onCancel={() => setEditingSet(null)}
        />
      )}

      {result && (
        <p className={`mx-4 mb-3 rounded-xl border px-3 py-2 text-[13px] ${TONE[result.vsLastTime]}`}>
          {result.comparison}
        </p>
      )}

      {/* Earned, not always-on: the last few sessions appear once she has done
          the work, so finishing a movement shows her the shape of her progress
          rather than another number to read mid-set. */}
      {targetMet && exercise.trend.length > 0 && (
        <div className="boost-rise mx-4 mb-3 rounded-xl border border-line bg-raised/60 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
            Last {exercise.trend.length} session{exercise.trend.length === 1 ? "" : "s"}
          </p>
          <div className="flex items-end gap-2">
            {[...exercise.trend, { date: "today", volume: todayVolume, topSet: null, reps: 0 }].map(
              (session, i, arr) => {
                const peak = Math.max(...arr.map((x) => x.volume), 1);
                const isToday = i === arr.length - 1;
                return (
                  <div key={session.date} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className={`text-[11px] tabular ${isToday ? "text-accent" : "text-faint"}`}>
                      {session.volume}
                    </span>
                    <div
                      className={`w-full rounded-t transition-all duration-500 ${isToday ? "bg-accent" : "bg-line"}`}
                      style={{ height: `${Math.max(6, (session.volume / peak) * 40)}px` }}
                    />
                    <span className="text-[10px] text-faint">
                      {isToday ? "today" : session.date.slice(5)}
                    </span>
                  </div>
                );
              },
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-faint">volume, {unit}</p>
        </div>
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
                {loaded && (
                  <NumberField
                    label={`Weight (${unit})`}
                    value={weight}
                    step={step}
                    min={0}
                    max={2000}
                    decimals
                    onChange={setWeight}
                  />
                )}
                <NumberField
                  label="Reps"
                  value={reps}
                  // The buttons nudge by whole reps, because that is what a rep
                  // is. Typing accepts a half for the set she got part-way
                  // through — rounding that down loses the half she did and
                  // rounding it up claims one she did not.
                  step={1}
                  decimals
                  min={0.5}
                  max={500}
                  onChange={setReps}
                  className={loaded ? "" : "col-span-2"}
                />
            </div>

            {/* The way in. Small, because it is the exception. */}
            {!loaded && (
              <button
                onClick={() => setAddWeight(true)}
                className="flex items-center gap-1.5 text-[12px] text-faint active:text-muted"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Holding a weight?
              </button>
            )}
            {/* One tap, one question: how many were left in the tank. It is
                the only fatigue signal available without a wearable, and it is
                what turns "3×8 @ 40" into something the progression maths can
                read. Skipping it logs the set with no answer — which is
                recorded as unknown, never as zero. */}
            {loaded && (
              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 shrink-0 text-[11px] uppercase tracking-wide text-faint">
                  Left in tank
                </span>
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => logSet(n)}
                    disabled={saving}
                    aria-label={`Log set ${setCount + 1} with ${n === 3 ? "3 or more" : n} reps left`}
                    className="min-w-11 flex-1 rounded-lg border border-edge py-2.5 text-[13px] text-muted active:bg-raised disabled:opacity-40"
                  >
                    {n === 3 ? "3+" : n}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => logSet()}
              disabled={saving}
              className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-ink active:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving…" : `Log set ${setCount + 1}`}
            </button>
            {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
          </div>
        )}
      </div>

      {guideOpen && (
        <FormGuide
          slug={exercise.slug}
          name={exercise.name}
          category={exercise.category}
          onClose={() => setGuideOpen(false)}
        />
      )}
    </section>
  );
}


function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="card mt-6 p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}
