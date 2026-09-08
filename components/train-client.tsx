"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "@/lib/use-dialog";
import { moveItem, slotFor } from "@/lib/reorder";
import { clockDuration, elapsedMs, readableDuration } from "@/lib/session-clock";
import { BEAT_CALM_S, beatSeconds } from "@/lib/heartbeat";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { AddExercise } from "./add-exercise";
import { AskCoach } from "./ask-coach";
import { NumberField } from "./number-field";
import { FormGuide } from "./form-guide";
import { MovementPicker } from "./movement-picker";
import { SessionDone } from "./session-done";
import {
  logSetOrQueue, setInput, useFlushPendingSets, usePendingSets, type PendingSet,
} from "@/lib/offline";
import type { ISODate } from "@/lib/date";
import { askToNotify, unlockAudio } from "@/components/rest-timer";
import { useRest } from "@/components/rest-provider";
import type { Pickable, PickableExercise, TodayExercise, TodayView } from "@/lib/views";

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
  date,
  isToday = true,
}: {
  view: TodayView;
  pickable: Pickable;
  targets?: NextTarget[];
  /** The day on screen. Every write from these cards is filed against it. */
  date?: string;
  /**
   * Whether that day is her today.
   *
   * The cards are the same on every day — a movement is a movement, and
   * having one UI for today and a list of names for every other day was two
   * things to build and one of them always behind. What changes is what can
   * be done: a session cannot be finished on a day that has not happened, and
   * a set cannot be logged into the future.
   */
  isToday?: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Record<string, LogResult>>({});
  const [finishing, setFinishing] = useState(false);
  const [finishEarly, setFinishEarly] = useState(false);
  const [done, setDone] = useState(false);
  /** How long the session ran, taken once when she finishes it. */
  const [finishedMs, setFinishedMs] = useState<number | null>(null);
  /**
   * Every day is editable, including the ones behind her.
   *
   * A past day used to arrive locked, on the reasoning that a finished
   * session is something she is reading and a mis-tap would rewrite it. The
   * cost turned out to be higher than the risk, and it lands on exactly the
   * person who most needs to type: training past midnight puts the session
   * she is *in* on "yesterday", so the app locks the workout she is doing
   * and asks her to tap Edit to carry on. A stray tap opens a stepper she
   * then has to confirm; that is a cheap mistake. Being unable to log the
   * set in front of her is not.
   */
  const editable = true;
  const [error, setError] = useState<string | null>(null);
  // The countdown lives above the router now, so it keeps running when she
  // wanders off to the food screen mid-rest.
  const { rest: runningRest, start: beginRest, dismiss: dismissRest, setSession } = useRest();

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
  const totalVolume = Math.round(
    view.exercises.reduce(
      (n, e) => n + e.loggedToday.reduce((v, s) => v + (s.weight ?? 0) * s.reps, 0),
      0,
    ),
  );
  const movementsWorked = view.exercises.filter((e) => e.loggedToday.length > 0).length;
  /**
   * What today holds, handed to the rest provider.
   *
   * The GO screen logs through the provider rather than through these cards,
   * so without this it cannot tell that the movement she just finished is
   * finished — and it kept offering a fifth set of something she had done
   * four of.
   */
  useEffect(() => {
    if (!isToday) return;
    setSession(view.exercises.map((e) => ({
      slug: e.slug, name: e.name, category: e.category,
      isHold: e.isHold, loadable: !e.bodyweight || e.loadable,
      targetSets: e.targetSets, done: e.loggedToday.length,
      targetReps: e.targetReps, targetHoldSeconds: e.targetHoldSeconds, targetWeight: e.targetWeight,
      restSeconds: e.restSeconds,
    })));
  }, [view.exercises, isToday, setSession]);
  // Movements that still have sets left in them. "Complete" has to mean
  // every one is done, or adding an exercise after signing off leaves the
  // card claiming the session is finished when it plainly isn't.
  const outstanding = view.exercises
    .filter((e) => e.targetSets > 0 && e.loggedToday.length < e.targetSets)
    .map((e) => e.name);

  /**
   * The movement she is on, marked at all times.
   *
   * This used to be "whatever the rest is counting down to", which meant the
   * marker existed only during the ninety seconds between sets and vanished
   * the moment the rest was dismissed or the GO screen cleared — so most of
   * the time nothing was marked at all, which is exactly when she is looking
   * for it.
   *
   * The rest still wins when one is running: it is the most specific thing
   * the app knows. Otherwise it is the first movement with sets left in it.
   */
  /**
   * Dragging a movement to a new place in the day.
   *
   * Pointer events rather than HTML5 drag-and-drop: that API does not fire on
   * touch at all, and this is a phone app first. The list reorders live under
   * her finger and the new order is written once, on release — a write per
   * pixel of movement would be a hundred round trips for one drag.
   */
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * The card under her finger, and where the list would land.
   *
   * The DOM order does not change while she drags. The dragged card follows
   * the finger and the others slide out of its way by one card's height —
   * both as transforms, both animatable. The first attempt reordered the
   * actual list on every pointer move, which meant the thing she was holding
   * never moved with her and everything else jumped around it: it worked and
   * felt broken.
   */
  const [drag, setDrag] = useState<{ slug: string; dy: number; from: number; to: number; height: number } | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);

  const shown = dragOrder
    ? dragOrder.flatMap((slug) => view.exercises.filter((e) => e.slug === slug))
    : view.exercises;

  /** How far card `i` slides to make room for the one being dragged. */
  function shiftFor(i: number): number {
    if (!drag || i === drag.from) return 0;
    if (drag.to > drag.from && i > drag.from && i <= drag.to) return -drag.height;
    if (drag.to < drag.from && i < drag.from && i >= drag.to) return drag.height;
    return 0;
  }

  function beginDrag(e: React.PointerEvent, slug: string) {
    const rows = [...(listRef.current?.children ?? [])] as HTMLElement[];
    if (rows.length < 2) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    // Measured once, before anything moves. Nothing in the DOM is reordered
    // during the drag, so these stay true for the whole gesture.
    const rects = rows.map((r) => r.getBoundingClientRect());
    const mids = rects.map((r) => r.top + r.height / 2);
    const slugs = shown.map((x) => x.slug);
    const from = slugs.indexOf(slug);
    const startY = e.clientY;
    const height = rects[from].height + 16; // the card plus the gap below it
    let to = from;

    setDrag({ slug, dy: 0, from, to, height });

    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      to = slotFor(mids, ev.clientY);
      setDrag({ slug, dy, from, to, height });
    };
    const end = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const order = moveItem(slugs, from, to);
      setDrag(null);
      if (order.join() === slugs.join()) return;
      // Show the new order straight away; the server catches up behind it.
      setDragOrder(order);
      try {
        await action("reorder_day_exercises", {
          slugs: order,
          ...(dayOfWeekOf(date) === undefined ? {} : { dayOfWeek: dayOfWeekOf(date) }),
        });
        router.refresh();
      } catch {
        setError("Couldn't save the new order.");
      } finally {
        // Held until the refresh lands, or the list snaps back to the old
        // order for a frame and then forward again.
        setTimeout(() => setDragOrder(null), 600);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  /**
   * The marker's pulse, re-read every couple of seconds.
   *
   * Not every frame: the duration is a CSS animation property, and changing
   * it restarts the animation — at 60fps that is not a heartbeat, it is a
   * flicker. Every two seconds is often enough to feel it settle across a
   * ninety-second rest and rare enough that each beat completes.
   */
  const [beat, setBeat] = useState(BEAT_CALM_S);
  useEffect(() => {
    const tick = () => setBeat(runningRest
      ? beatSeconds(runningRest.endsAt - Date.now(), runningRest.seconds * 1000)
      : BEAT_CALM_S);
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [runningRest]);

  const stillToDo = (slug: string | undefined) => {
    const e = view.exercises.find((x) => x.slug === slug);
    return Boolean(e && e.targetSets > 0 && e.loggedToday.length < e.targetSets);
  };
  const currentSlug =
    // A finished movement never wears the marker, whatever the rest says. The
    // rest can legitimately be *for* the one just completed — it starts
    // between sets and the last set does not end it — and the marker sitting
    // on four-of-four while the next movement waits is the exact thing that
    // was reported.
    (stillToDo(runningRest?.slug) ? runningRest?.slug : undefined)
    ?? view.exercises.find((e) => e.targetSets > 0 && e.loggedToday.length < e.targetSets)?.slug
    ?? null;

  const startRest = useCallback((exercise: TodayExercise, last?: { reps: number; weight: number | null }) => {
    beginRest({
      slug: exercise.slug,
      name: exercise.name,
      category: exercise.category,
      unit: view.unit,
      // Seeded with what she just did, which is what she is most likely to do
      // again — the GO screen logs the next set from here without her going
      // back to the card for the numbers.
      isHold: exercise.isHold,
      // Seconds for a hold, reps otherwise — the GO screen reads isHold and
      // labels the field accordingly, so this number must already be in the
      // right unit. A wall sit seeded with "3 reps" is nonsense either way.
      reps: exercise.isHold
        ? last?.reps ?? exercise.targetHoldSeconds ?? 30
        : last?.reps ?? exercise.targetReps,
      weight: last?.weight ?? exercise.targetWeight,
      loadable: !exercise.bodyweight || exercise.loadable,
      date,
      // An absolute end time, so a throttled or sleeping tab cannot drift it.
      endsAt: Date.now() + exercise.restSeconds * 1000,
      seconds: exercise.restSeconds,
    });
  }, [beginRest, view.unit, date]);

  /**
   * Finishing is one button now.
   *
   * It used to be five — Brutal to Easy — asking how the session felt. Reps in
   * reserve per set answers the same question better and is already being
   * collected one tap at a time, so the five-way was a second, coarser copy of
   * a signal we have. The coach can still ask in words when it matters, and
   * finish_workout still takes a feeling when she gives one.
   */
  /**
   * Opening the session by hand, rather than inferring one from the first set.
   *
   * The app used to treat "today" as the session, which is fine until someone
   * trains past midnight: the workout she is in the middle of becomes
   * yesterday's, the screen shows an empty new day, and the coach is told
   * there is no session at all. A start and a finish give it edges.
   */
  async function startSession() {
    setFinishing(true);
    setError(null);
    try {
      // Her tap is also the gesture iOS needs before any of this can beep.
      unlockAudio();
      await action("start_workout", date === undefined ? {} : { date });
      router.refresh();
    } catch {
      setError("Couldn't start the session — check your signal and try again.");
    } finally {
      setFinishing(false);
    }
  }

  async function finish(feeling?: number) {
    setFinishing(true);
    setError(null);
    try {
      // Anything still queued belongs in this session's summary.
      await flush();
      await action("finish_workout", feeling === undefined ? {} : { feeling });
      dismissRest();
      // Said properly, once, and only when she says she is done — a card
      // quietly turning green was the whole celebration for the thing this
      // app exists to get her to do.
      setFinishedMs(elapsedMs(view.startedAt, Date.now(), view.finishedAt));
      setDone(true);
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
        {editable && <AddExercise pickable={pickable} dayOfWeek={dayOfWeekOf(date)} />}
      </div>
    );
  }
  if (!view.hasPlan || view.exercises.length === 0) {
    return (
      <div className="space-y-4">
        <Empty
          title="No workout planned"
          body="Add movements below and this becomes today's session — or ask your coach to build the whole week."
        />
        {/* Not gated on there being a plan. It used to be, because the tool
            refused without one and the button would have failed — so the only
            offer on an empty week was a model call. Adding the first movement
            starts the week now (lib/tools/training.ts startEmptyWeek). */}
        {editable && <AddExercise pickable={pickable} dayOfWeek={dayOfWeekOf(date)} />}
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isToday && (
        <SessionBar
          startedAt={view.startedAt}
          finishedAt={view.finishedAt}
          busy={finishing}
          onStart={startSession}
          onFinish={() => finish()}
        />
      )}
      {pending.length > 0 && <PendingBanner count={pending.length} onRetry={flush} />}

      {/*
        One card at a time under a thumb; two columns where there is room.
        A grid rather than a flowed column: a card grows when she opens the
        stepper, and in a flow that would shove every later card sideways.
      */}
      <div
        ref={listRef}
        className={`space-y-4 xl:grid xl:items-start xl:gap-4 xl:space-y-0 xl:[&>*]:mb-4 ${gridFor(view.exercises.length)}`}
      >
      {shown.map((ex, i) => (
        <ExerciseCard
          key={ex.slug}
          exercise={ex}
          dragging={drag?.slug === ex.slug}
          // The dragged card rides the finger; the others slide out of its
          // way. Both transforms, so both animate.
          offsetY={drag?.slug === ex.slug ? drag.dy : shiftFor(i)}
          onDragStart={editable ? (e) => beginDrag(e, ex.slug) : undefined}
          unit={view.unit}
          pickable={pickable}
          date={date}
          canLog={editable}
          editable={editable}
          next={targets.find((t) => t.slug === ex.slug)}
          result={feedback[ex.slug]}
          pending={pendingFor.get(ex.slug) ?? NO_PENDING}
          onLogged={(r, finishedExercise, logged) => {
            if (r) setFeedback((f) => ({ ...f, [ex.slug]: r }));
            // Rest runs between sets *and* between movements — finishing the
            // squats is exactly when she needs a minute before the next thing.
            // The only set with nothing to recover for is the last one of the
            // session, and that is the one that stops the timer.
            const wasLastOfSession = finishedExercise
              && outstanding.filter((name) => name !== ex.name).length === 0;
            // Finishing a movement rests *into the next one*, not back into
            // the one she has just finished — that rest is over before she
            // walks to the rack, and the GO screen was offering her a fifth
            // set of something she had done four of.
            const next = finishedExercise ? nextAfter(view.exercises, ex.slug) : null;
            if (wasLastOfSession) dismissRest();
            else if (next) startRest(next);
            else startRest(ex, logged);
            // Nothing new to fetch while the set is sitting in the outbox, and
            // a refresh with no signal just hangs.
            if (r) router.refresh();
          }}
          onRetryPending={flush}
          onRemoved={() => router.refresh()}
          upNext={currentSlug === ex.slug}
          beatSeconds={beat}
        />
      ))}
      </div>

      {editable && <AddExercise pickable={pickable} dayOfWeek={dayOfWeekOf(date)} />}

      {/*
        Finishing is offered when there is a session to finish, not while she
        is mid-way through one. Five big buttons under a half-done workout is
        an invitation to end it by accident — which is what happened: a tap
        closed the session, stopped the rest timer, and collapsed the sets she
        was still entering.
      */}
      {/* Nothing logged and nothing finished is nothing to say — the cards
          above are the instruction, and a card whose only content is "get
          going" is furniture. */}
      <div className={!isToday || (totalLogged === 0 && !view.completed) ? "hidden" : "card p-4"}>
        {view.completed && outstanding.length === 0 ? (
          <div className="text-center">
            <p className="text-[15px] font-semibold text-beat">Session done</p>
            <p className="mt-1 text-[13px] text-muted">
              {totalLogged} set{totalLogged === 1 ? "" : "s"} across {movementsWorked} movement
              {movementsWorked === 1 ? "" : "s"}.
            </p>
          </div>
        ) : totalLogged === 0 ? (
          // Nothing to say. The cards above are the instruction, and a card
          // whose only content is "get going" is a row of furniture.
          null
        ) : (
          <div className="text-center">
            {/*
              One button, always here, saying the same thing whether or not
              there is work left. "Finish early" was a grey underlined link at
              12px — the app hedging about whether she is allowed to stop, for
              a decision that is entirely hers. What changes with work left is
              the confirmation, not the prominence.
            */}
            <p className="mb-3 text-[13px] text-muted">
              {outstanding.length > 0
                ? `Still to do: ${outstanding.join(", ")}`
                : `${totalLogged} set${totalLogged === 1 ? "" : "s"} logged. Everything on the plan is done.`}
            </p>

            {finishEarly ? (
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => void finish()} disabled={finishing}
                  className="rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-on-accent disabled:opacity-50">
                  {finishing ? "Finishing…" : "Yes, I'm done"}
                </button>
                <button onClick={() => setFinishEarly(false)}
                  className="rounded-xl border border-line px-4 py-3 text-[13px] text-muted">
                  Keep going
                </button>
              </div>
            ) : (
              <button
                onClick={() => (outstanding.length > 0 ? setFinishEarly(true) : void finish())}
                disabled={finishing}
                className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-50"
              >
                {finishing ? "Finishing…" : "Finish workout"}
              </button>
            )}
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-center text-[13px] text-miss">{error}</p>}
      </div>

      {done && (
        <SessionDone
          sets={totalLogged}
          movements={movementsWorked}
          volume={totalVolume}
          unit={view.unit}
          // The session's own length, and a line chosen from it so it does
          // not change while she is reading it.
          // Frozen when the session ended, not read from the clock during a
          // render — the length of a finished session does not change.
          durationMs={finishedMs}
          seed={view.startedAt ?? view.date}
          onClose={() => setDone(false)}
        />
      )}
    </div>
  );
}

/**
 * Start, a running clock, finish.
 *
 * Top of the screen and left of everything, because it is the frame the rest
 * of the session sits inside — and because "have I started?" is the question
 * she asks first when she picks the phone up mid-workout.
 */
function SessionBar({
  startedAt, finishedAt, busy, onStart, onFinish,
}: {
  startedAt: string | null;
  finishedAt: string | null;
  busy: boolean;
  onStart: () => void;
  onFinish: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt, finishedAt]);

  const ms = elapsedMs(startedAt, now, finishedAt);

  if (!startedAt) {
    return (
      <button
        onClick={onStart}
        disabled={busy}
        className="flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-accent active:opacity-80 disabled:opacity-50"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
        {busy ? "Starting…" : "Start workout"}
      </button>
    );
  }

  if (finishedAt) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-beat/40 bg-beat-soft px-4 py-2.5 text-[13px] font-medium text-beat">
        Finished — {readableDuration(ms)}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-full border border-edge bg-surface px-3.5 py-2.5">
        <span className="size-2 animate-pulse rounded-full bg-beat" aria-hidden />
        {/* Not a live region: it repaints every second, and announcing each
            tick would talk over everything else the way the rest countdown
            once did. */}
        <span className="text-[15px] font-semibold tabular-nums">{clockDuration(ms)}</span>
      </div>
      <button
        onClick={onFinish}
        disabled={busy}
        className="rounded-full border border-edge px-4 py-2.5 text-[13px] font-medium text-muted active:bg-raised disabled:opacity-50"
      >
        {busy ? "Finishing…" : "Finish workout"}
      </button>
    </div>
  );
}

/** 0=Monday, from a YYYY-MM-DD. Undefined when the caller means today. */
/**
 * The next movement with sets left in it, after this one.
 *
 * Wraps, because she may have skipped down the card list and come back — the
 * one thing it will not return is the movement she has just finished.
 */
export function nextAfter(exercises: TodayExercise[], slug: string): TodayExercise | null {
  const at = exercises.findIndex((e) => e.slug === slug);
  if (at === -1) return null;
  const order = [...exercises.slice(at + 1), ...exercises.slice(0, at)];
  return order.find((e) => e.targetSets > 0 && e.loggedToday.length < e.targetSets) ?? null;
}

function dayOfWeekOf(date?: string): number | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

/**
 * How many columns of cards, so the last row is not a lonely orphan.
 *
 * Four movements in three columns is a row of three and a row of one, which
 * reads as a layout accident. The column count is chosen to divide the cards
 * evenly where a count exists that does; where none does, the last card
 * stretches across what is left, so the shortfall looks deliberate rather
 * than dropped.
 *
 * Literal class strings because Tailwind scans source text — a computed
 * `xl:grid-cols-${n}` is a class that never gets generated.
 */
function gridFor(n: number): string {
  if (n <= 1) return "";
  // Three across when three divide them, two when two do, three otherwise.
  // Four movements in three columns was a row of three and a lonely one; the
  // fix for that was stretching the orphan across the gap, which looked worse
  // — a card twice the width of its neighbours for no reason anyone can see.
  const cols = n % 3 === 0 ? 3 : n % 2 === 0 ? 2 : Math.min(n, 3);
  // Literal class strings, because Tailwind scans source text: a computed
  // `xl:grid-cols-${n}` is a class that never gets generated.
  return cols === 3 ? "xl:grid-cols-3" : "xl:grid-cols-2";
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
/**
 * Relabel a movement, taking today's sets with it.
 *
 * Distinct from a substitution on purpose. Swapping to a different movement
 * mid-session leaves the earlier sets where they are, because they really were
 * the old movement; this is for the case where the name was wrong all along —
 * she has been doing V-ups and the app has been calling them sit-ups.
 */
function ChangeMovement({
  exercise, pickable, setCount, date, onDone, onCancel,
}: {
  exercise: TodayExercise;
  pickable: Pickable;
  setCount: number;
  date?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = pickable.groups.flatMap((g) => g.items).find((i) => i.slug === slug);

  async function change() {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      await action("change_exercise", {
        slug: exercise.slug, toSlug: slug, ...(date === undefined ? {} : { date }),
      });
      onDone();
    } catch (err) {
      setError(actionMessage(err, "Couldn't change that — try again."));
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 mb-3 rounded-xl border border-line bg-raised p-3">
      <p className="mb-3 text-[12px] text-muted">
        What was it really?{" "}
        {setCount > 0 && (
          <span className="text-faint">
            Your {setCount} set{setCount === 1 ? "" : "s"} move across.
          </span>
        )}
      </p>
      <MovementPicker pickable={pickable} value={slug} onPick={setSlug} />
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={change}
          disabled={busy || !slug}
          className="flex-1 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-on-accent disabled:opacity-40"
        >
          {busy ? "Changing…" : chosen ? `It was ${chosen.name}` : "Pick a movement"}
        </button>
        <button onClick={onCancel} disabled={busy}
          className="rounded-xl border border-line px-3 py-2.5 text-[13px] text-muted disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SetEditor({
  slug, setNumber, set, unit, bodyweight, date, onDone, onCancel,
}: {
  slug: string;
  setNumber: number;
  /** Which day's set this is. */
  date?: string;
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
        await action("delete_set", { exerciseSlug: slug, setNumber, ...(date === undefined ? {} : { date }) });
      } else {
        await action("correct_set", {
          exerciseSlug: slug, setNumber, reps,
          ...(date === undefined ? {} : { date }),
          ...(loaded ? { weight: weight > 0 ? weight : null } : {}),
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
          className="flex-1 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-on-accent disabled:opacity-50">
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

export function ExerciseCard({
  exercise, unit, next, result, pending, pickable, date, canLog = true, editable = true,
  onLogged, onRetryPending, onRemoved, upNext = false, dragging = false, onDragStart,
  beatSeconds: beat = BEAT_CALM_S, offsetY = 0,
}: {
  exercise: TodayExercise; unit: string; next?: NextTarget;
  pickable: Pickable;
  /** The day this card writes to. Undefined means her today. */
  date?: string;
  /** False on a day that has not happened yet — nothing to record there. */
  canLog?: boolean;
  /** False while a past day is locked: read it, do not rewrite it. */
  editable?: boolean;
  result?: LogResult; pending: PendingSet[];
  onLogged: (
    r: LogResult | null,
    finishedExercise: boolean,
    /** The set she just logged, to seed the next one. */
    logged: { reps: number; weight: number | null },
  ) => void;
  onRetryPending: () => void;
  onRemoved: () => void;
  /** The rest running right now is counting down to this movement. */
  upNext?: boolean;
  /** Being dragged to a new place in the day. */
  dragging?: boolean;
  /** Absent on a day she cannot edit — no handle is drawn. */
  onDragStart?: (e: React.PointerEvent) => void;
  /** How fast the marker beats — a heart rate settling through the rest. */
  beatSeconds?: number;
  /** Where the drag has put this card, in pixels from where it sits. */
  offsetY?: number;
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
  /**
   * Reps left in the tank, chosen but not yet sent.
   *
   * Tapping a number used to log the set on the spot, which meant answering
   * this was also committing to the reps and weight above it — and there was
   * no way back if the number was wrong. It selects now; the button below
   * sends. Null is "she did not say", which is not zero.
   */
  const [rir, setRir] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  /**
   * The card's height while closed, held so the grid does not collapse
   * behind it when it lifts out — measured at the moment it opens, which is
   * the only moment it is both rendered in place and about to leave.
   */
  const shell = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState<number | undefined>(undefined);
  function openCard() {
    setCollapsedHeight(shell.current?.offsetHeight);
    setOpen(true);
  }
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [changing, setChanging] = useState(false);
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
    // The library says a weight is possible for this movement — a V-up with a
    // dumbbell is a V-up. Hidden behind an opt-in, the field was a thing she
    // had to know existed, and the number went unrecorded when she did not.
    || exercise.loadable
    || addWeight
    || done.some((s) => s.weight !== null)
    || queued.some((s) => s.weight !== null);

  const setCount = done.length + queued.length;
  const targetMet = exercise.targetSets > 0 && setCount >= exercise.targetSets;

  /**
   * The small version of a celebration: the moment the last planned set of a
   * movement lands, and only that moment. It appears because the count
   * crossed the target while she was looking, not because the card happens to
   * be complete — arriving at a finished card should say nothing.
   */
  const [justMet, setJustMet] = useState(false);
  const wasMet = useRef(targetMet);
  useEffect(() => {
    if (targetMet && !wasMet.current) {
      setJustMet(true);
      const id = window.setTimeout(() => setJustMet(false), 4000);
      wasMet.current = targetMet;
      return () => window.clearTimeout(id);
    }
    wasMet.current = targetMet;
  }, [targetMet]);
  // Volume is load × reps, which a hold does not have. A wall sit contributes
  // no tonnage and pretending it does would inflate the number silently.
  const todayVolume = Math.round(
    [...done, ...queued].reduce((n, s) => n + (s.weight ?? 0) * (s.reps ?? 0), 0),
  );

  async function removeFromToday() {
    setRemoving(true);
    setError(null);
    try {
      // An extra is held on the day by its sets and nothing else, so removing
      // it *is* deleting them. Said plainly in the confirm above, because this
      // is the one remove on this screen that loses work she did.
      if (exercise.extra) {
        await action("remove_logged_exercise", {
          exerciseSlug: exercise.slug, ...(date === undefined ? {} : { date }),
        });
      } else {
        await action("remove_exercise_from_day", {
        slug: exercise.slug, ...(dayOfWeekOf(date) === undefined ? {} : { dayOfWeek: dayOfWeekOf(date) }),
      });
      }
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
        // Zero is not a weight. An untouched field on a movement she did with
        // nothing in her hands is bodyweight, and recording it as "0 kg" is
        // the same class of lie as counting an unknown as a zero.
        setInput(
          exercise.slug,
          exercise.isHold ? { holdSeconds: reps } : reps,
          loaded && weight > 0 ? weight : null,
          rir,
          date as ISODate | undefined,
        ),
      );
      // Whether that was the last set she planned for this movement.
      // Out of the way once the set is in. Lifted over the screen, a card
      // that stays open hides the rest timer, the movement that is next, and
      // the highlight saying which one it is — she logged a set and could not
      // see anything that happened as a result of it.
      setOpen(false);
      // How it went, for the companion at the bottom of the page. He is
      // pleased or he is not, in the register the coach speaks in.
      if (outcome.result) {
        window.dispatchEvent(new CustomEvent("coach:set", {
          detail: { vs: outcome.result.vsLastTime, rir: rir ?? null },
        }));
      }
      onLogged(
        outcome.result,
        exercise.targetSets > 0 && setCount + 1 >= exercise.targetSets,
        { reps, weight: loaded && weight > 0 ? weight : null },
      );
      // A good call is also the moment to drain anything stuck from earlier.
      if (!outcome.queued) onRetryPending();
    } catch {
      setError("That didn't save — tap to try again.");
    } finally {
      setSaving(false);
    }
  }

  const step = weight >= 100 ? 5 : weight >= 20 ? 2.5 : 1;

  const card = (
    /* The movement she is on. A colour change on a one-pixel border was not
       findable in a glance down at a bench — this is green, ringed and
       breathing, because the question it answers is "which one am I doing"
       and she is asking it mid-set with a dumbbell in her hand. */
    <section
      className={`card overflow-hidden ${
        upNext ? "border-beat now-glow" : ""
      } ${dragging ? "z-20 scale-[1.02] shadow-xl shadow-scrim/70" : ""}`}
      style={{
        ...(upNext ? { animationDuration: `${beat}s` } : {}),
        ...(offsetY !== 0 || dragging
          ? {
            transform: `translateY(${offsetY}px)${dragging ? " scale(1.02)" : ""}`,
            // The card in her hand tracks the finger with no easing at all;
            // the ones getting out of the way ease, or the list snaps.
            transition: dragging ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
            position: "relative" as const,
            zIndex: dragging ? 20 : undefined,
          }
          : { transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)" }),
      }}
    >
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        {/*
          The name and the target are the card's own open/close control. She
          is looking at the movement she is about to do and tapping it is the
          obvious thing; making her find a button lower down was a step for
          nothing. The controls to the right keep their own jobs.
        */}
        <button
          onClick={() => canLog && (open ? setOpen(false) : openCard())}
          aria-expanded={canLog ? open : undefined}
          aria-label={canLog ? `${open ? "Hide" : "Show"} the set counter for ${exercise.name}` : exercise.name}
          className="min-w-0 flex-1 text-left"
        >
          {/* Truncated in the grid, where every card must stay the same
              height; whole when it is the only thing on the screen. "Dumbbell
              Hammer …" is not a movement anyone can read back. */}
          <h2 className={`text-[17px] font-semibold ${open ? "" : "truncate"}`}>{exercise.name}</h2>
          {/* The computed target where there is one — worked out from what she
              actually logged, not re-derived by the model each week. Labelled
              as a target, because a target read as an achievement is a bug
              this app has had before. */}
          {/*
            Target and last time on one line. As two rows, a movement she has
            done before made a taller card than one she hasn't, and a grid of
            them came out ragged for a reason that had nothing to do with the
            training.
          */}
          <p className="mt-0.5 text-[13px] text-muted tabular">
            Target {next ? next.target.sets : exercise.targetSets}×{next ? next.target.reps : exercise.targetReps}
            {(next ? next.target.weight : exercise.targetWeight) !== null &&
              ` @ ${next ? next.target.weight : exercise.targetWeight}${unit}`}
            {exercise.lastTime && (
              <span className="text-faint"> · last {summariseSets(exercise.lastTime.sets, unit)}</span>
            )}
          </p>
          {next && next.change === "up" && (
            <p className="mt-1 text-[12px] text-beat">Up from last time</p>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* The grip. `touch-action: none` is what stops the browser reading
              the drag as a page scroll and swallowing it — without it this
              works with a mouse and does nothing at all on a phone, which is
              the device it is for. */}
          {onDragStart && (
            <button
              onPointerDown={onDragStart}
              aria-label={`Reorder ${exercise.name}`}
              className="grid size-8 shrink-0 cursor-grab place-items-center rounded-full text-faint active:cursor-grabbing active:bg-raised"
              style={{ touchAction: "none" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
              </svg>
            </button>
          )}
          {done.length >= exercise.targetSets && exercise.targetSets > 0 && (
            <span className="grid size-6 place-items-center rounded-full bg-beat text-[12px] text-on-accent"
              aria-label="Target sets complete">✓</span>
          )}
          {exercise.extra && (
            <span className="rounded-full bg-raised px-2.5 py-1 text-[11px] text-faint">Added</span>
          )}
          {/*
            The visible way in. Tapping the name works too, but an affordance
            you have to be told about in a line of grey text is not one — and
            that line was the app apologising for its own layout.
          */}
          {canLog && (
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? "Close" : "Log a set for"} ${exercise.name}`}
            className={`grid size-8 place-items-center rounded-full border transition-colors ${
              open ? "border-accent bg-accent-soft text-accent" : "border-edge bg-raised text-text"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M12 5v14M5 12h14" />}
            </svg>
          </button>
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
          {/*
            "That was actually a different movement." The sets she has already
            logged come with it — she did the work, she just called it
            something else, and a relabel that loses the history is a delete
            wearing a friendly name.
          */}
          {editable && (
          <button
            onClick={() => { setChanging(!changing); setConfirmRemove(false); }}
            aria-label={`Change what ${exercise.name} is`}
            aria-expanded={changing}
            className={`grid size-8 place-items-center rounded-full border text-muted ${
              changing ? "border-accent text-accent" : "border-line"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h13l-3-3M20 16H7l3 3" />
            </svg>
          </button>
          )}
          {/*
            Extras are not on the plan, so "remove" means deleting the sets
            themselves — the only thing holding them on the day. It used to
            mean no button at all, which left a movement she had logged once
            with no way off the screen.
          */}
          {editable && (!exercise.extra || setCount > 0) && (
            <button
              onClick={() => { setConfirmRemove(!confirmRemove); setChanging(false); }}
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

      {justMet && (
        <p className="go-sub mx-4 mb-3 rounded-xl border border-beat/40 bg-beat-soft px-3 py-2 text-center text-[13px] font-medium text-beat">
          {exercise.targetSets}×{exercise.targetReps} done — that&rsquo;s {exercise.name} finished.
        </p>
      )}

      {changing && (
        <ChangeMovement
          exercise={exercise}
          pickable={pickable}
          setCount={setCount}
          date={date}
          onDone={() => { setChanging(false); onRemoved(); }}
          onCancel={() => setChanging(false)}
        />
      )}

      {confirmRemove && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2">
          <p className="flex-1 text-[12px] text-muted">
            {exercise.extra
              ? `Delete ${setCount} logged set${setCount === 1 ? "" : "s"} of ${exercise.name}?`
              : setCount > 0
                ? "Remove from today's plan? Your logged sets stay."
                : "Remove from today?"}
          </p>
          <button onClick={() => setConfirmRemove(false)} className="-my-1 px-2.5 py-2.5 text-[12px] text-muted">Keep</button>
          <button onClick={removeFromToday} disabled={removing}
            className="-my-1 px-2.5 py-2.5 text-[12px] font-medium text-miss disabled:opacity-50">
            {removing ? "…" : "Remove"}
          </button>
        </div>
      )}

      {exercise.notes && <p className="px-4 pb-3 text-[13px] text-faint italic">{exercise.notes}</p>}

      {/* Closed, one cue at a time — a card in a grid has room for a line.
          Open, the whole entry: she has the screen, and the reason to read it
          is that she is about to do the movement. */}
      {open
        ? <FullCues exercise={exercise} />
        : <CyclingCue cues={exercise.formCues} />}

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
                ? "bg-accent text-on-accent"
                : "border border-dashed border-edge text-faint"
          }`;

          // A square with nothing in it is the next set: tapping it opens the
          // entry, the same as the + does. It looked like a slot to fill from
          // the first day and did nothing at all.
          if (!s && canLog) {
            return (
              <button
                key={i}
                onClick={openCard}
                aria-label={`Log set ${i + 1} of ${exercise.name}`}
                className={`${shape} transition-opacity hover:opacity-80`}
              >
                {label}
              </button>
            );
          }
          // Only a set that has actually landed can be corrected — one still
          // in the outbox has no row to correct yet.
          if (!s || isQueued) return <div key={i} className={shape}>{label}</div>;
          return (
            <button
              key={i}
              onClick={() => editable && setEditingSet(editingSet === i + 1 ? null : i + 1)}
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

      {editable && editingSet !== null && done[editingSet - 1] && (
        <SetEditor
          slug={exercise.slug}
          setNumber={editingSet}
          date={date}
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

      <div className={open ? "border-t border-line bg-ink/40 p-3" : "hidden"}>
        {!open ? null : (
          <div className="space-y-3">
            {/* Last time, set by set, right where this set is being typed.
                The summary on the header line collapses "12, 12, 10" into
                "3×12" and loses exactly the comparison she is making — the
                deeper read is Progress; this is the glance. */}
            {exercise.lastTime && (
              <p className="text-[11px] text-faint tabular">
                Last time ({exercise.lastTime.date.slice(5)}):{" "}
                {exercise.lastTime.sets
                  .map((s) => `${s.reps}${s.weight !== null ? `@${s.weight}` : ""}`)
                  .join(" · ")}
              </p>
            )}
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
                    onClick={() => setRir(rir === n ? null : n)}
                    disabled={saving}
                    aria-pressed={rir === n}
                    aria-label={`${n === 3 ? "3 or more" : n} reps left in the tank`}
                    className={`min-w-11 flex-1 rounded-lg border py-2.5 text-[13px] active:bg-raised disabled:opacity-40 ${
                      rir === n ? "border-accent bg-accent-soft text-accent" : "border-edge text-muted"
                    }`}
                  >
                    {n === 3 ? "3+" : n}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => logSet(rir ?? undefined)}
              disabled={saving}
              className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent active:opacity-80 disabled:opacity-50"
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

  // Closed, it is one card among several.
  if (!open) return <div ref={shell}>{card}</div>;

  /**
   * Open, it comes forward.
   *
   * Expanding in place pushed every other card around it, and the grid of
   * them reflowed under her thumb mid-set. The movement she is working on is
   * the only thing that matters for the next ninety seconds, so it takes the
   * middle of the screen and the rest sit behind the scrim.
   *
   * The placeholder holds its space in the grid, so the cards behind do not
   * jump as it lifts out and settles back.
   */
  return (
    <>
      <div aria-hidden className="card invisible" style={{ height: collapsedHeight }} />
      <CardModal onClose={() => setOpen(false)}>{card}</CardModal>
    </>
  );
}

/**
 * The lifted card, and the page held still behind it.
 *
 * `useDialog` is not optional here: this claims the page behind is inert, so
 * Escape has to close it, Tab has to stay inside it, focus has to come back
 * to the card that opened it, and the page underneath must not scroll — all
 * of which it does, and all of which were a lie the first time a sheet in
 * this app said aria-modal without it.
 */
function CardModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const panel = useDialog(onClose);
  return (
    <div
      className="card-scrim fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-scrim/70 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log a set"
    >
      <div
        ref={panel}
        onClick={(e) => e.stopPropagation()}
        // The padding is not decoration: the marker is a box-shadow, and a
        // scrolling box clips anything drawn outside it — which showed as the
        // green appearing at the corners only. This gives the glow room
        // inside the panel it scrolls in.
        className="card-lift w-full max-w-lg overscroll-contain p-2"
        style={{ maxHeight: "94dvh", overflowY: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}


/**
 * The whole library entry, for the card that has the screen to itself.
 *
 * The same content the help button fetches, without the fetch: it is three
 * columns of a row the day view already reads. Ordered the way it is used —
 * how to set up, what goes wrong, and then the one thing worth stopping for.
 */
function FullCues({ exercise }: { exercise: TodayExercise }) {
  const { formCues, commonMistakes, safetyNote } = exercise;
  if (formCues.length === 0 && commonMistakes.length === 0 && !safetyNote) return null;
  return (
    <div className="space-y-3 px-4 pb-3 text-[12px] leading-relaxed">
      {formCues.length > 0 && (
        <ol className="space-y-1.5 text-muted">
          {formCues.map((c, i) => (
            <li key={c} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-faint">{i + 1}</span>
              {c}
            </li>
          ))}
        </ol>
      )}
      {commonMistakes.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-faint">Commonly gets wrong</p>
          <ul className="space-y-1 text-faint">
            {commonMistakes.map((m) => (
              <li key={m} className="flex gap-2"><span aria-hidden>·</span>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {safetyNote && (
        <p className="rounded-lg border border-hold/40 bg-hold-soft px-3 py-2 text-hold">{safetyNote}</p>
      )}
    </div>
  );
}

/**
 * One setup cue at a time, on the card, always.
 *
 * The library's cues were behind the help button, which meant they were read
 * once — on the day she looked something up — and never again. They are the
 * form resource this app has, and a rack is where they matter. So one shows
 * at a time and they take turns, and over a few sessions she has seen all of
 * them without ever opening anything.
 *
 * Deliberately not a live region: it repaints on a timer, and announcing each
 * change would talk over everything else the way the rest countdown once did.
 */
function CyclingCue({ cues }: { cues: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (cues.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % cues.length), CUE_MS);
    return () => window.clearInterval(id);
  }, [cues.length]);

  if (cues.length === 0) return null;
  const cue = cues[i % cues.length];
  return (
    <p className="px-4 pb-3 text-[12px] leading-relaxed text-faint">
      {/* Keyed on the text, so React swaps the node and the fade runs again. */}
      <span key={cue} className="cue-fade block">{cue}</span>
    </p>
  );
}

/** Long enough to read one twice, short enough to see several in a session. */
const CUE_MS = 7000;

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="card mt-6 p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}
