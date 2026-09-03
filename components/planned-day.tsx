"use client";

import { AddExercise } from "./add-exercise";
import { PlannedExerciseRow } from "./planned-exercise-row";
import type { PickableExercise, TodayView } from "@/lib/views";

/**
 * A day that is not today: something to arrange, or something to look back at.
 *
 * Today is a session — the Train screen's cards, where logging happens. Every
 * other day is a plan she can edit, and a past day is also a record of what
 * she did. Both are the same list; what differs is whether the numbers under
 * a movement are a target or a result.
 */
export function PlannedDay({
  view, pickable, dayOfWeek, past,
}: {
  view: TodayView;
  pickable: { group: string; items: PickableExercise[] }[];
  /** 0=Monday. Which day of the plan the add and remove buttons act on. */
  dayOfWeek: number;
  past: boolean;
}) {
  return (
    <>
      {view.exercises.length > 0 ? (
        <div className="mb-3">
          {view.exercises.map((e) => (
            <PlannedExerciseRow
              key={e.slug}
              slug={e.slug}
              name={e.name}
              target={
                e.loggedToday.length > 0
                  ? e.loggedToday.map((s) => `${s.reps}${s.weight !== null ? `@${s.weight}` : ""}`).join("  ")
                  : `${e.targetSets}×${e.targetReps}${e.targetWeight !== null ? ` @ ${e.targetWeight}${view.unit}` : ""}`
              }
              dayOfWeek={dayOfWeek}
              // What she did beats what was planned, and says which it is.
              done={e.loggedToday.length > 0}
            />
          ))}
        </div>
      ) : (
        <p className="mb-3 py-2 text-[13px] leading-relaxed text-faint">
          {past
            ? "Nothing logged, and nothing was scheduled."
            : "A rest day for now. Add a movement and it becomes a training day; take the last one off again and it goes back to being rest."}
        </p>
      )}
      <AddExercise groups={pickable} dayOfWeek={dayOfWeek} label={`+ Add to ${view.dayName}`} />
    </>
  );
}
