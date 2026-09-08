"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { NumberField } from "./number-field";

export type LadderRung = {
  id: string;
  title: string;
  target: number | null;
  achieved: boolean;
  achievedOn: string | null;
  auto: boolean;
  targetDate: string | null;
};

/**
 * Where she is going, and the rungs between here and there.
 *
 * A goal weight on its own is one number a long way off. Someone thirty
 * pounds out reads "30 lb to goal" every week for months while a bar creeps
 * across by a pixel, and the app has nothing else to say. The ladder is what
 * makes the same journey answerable — five down is a thing that happens, and
 * on the way to thirty it happens six times.
 *
 * The goal is editable here for the same reason. It was set once during
 * onboarding and after that the only way to change it was to ask the coach,
 * which is a strange thing to have to do about your own target — and the
 * ladder is rebuilt from it, so a goal you cannot reach is a ladder you
 * cannot fix.
 */
export function GoalCard({
  goal, current, start, unit, rungs, goalDate, direction,
}: {
  goal: number | null;
  current: number | null;
  start: number | null;
  unit: string;
  rungs: LadderRung[];
  goalDate: string | null;
  direction: "lose" | "gain" | "hold";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [weight, setWeight] = useState(goal ?? current ?? 0);
  const [date, setDate] = useState(goalDate ?? "");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = rungs.find((r) => !r.achieved) ?? null;
  const hit = rungs.filter((r) => r.achieved).length;

  async function saveGoal() {
    setBusy(true); setError(null);
    try {
      await action("update_profile", { goalWeight: weight, ...(date ? { goalDate: date } : {}) });
      // update_profile rebuilds the ladder itself; this is the belt to its
      // braces, and is idempotent — a rung already reached stays reached.
      await action("set_weight_milestones", {});
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(actionMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function addMilestone() {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    try {
      await action("set_goal", { title: title.trim(), kind: "habit" });
      setTitle(""); setAdding(false);
      router.refresh();
    } catch (e) {
      setError(actionMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true); setError(null);
    try {
      await action("remove_goal", { goalId: id });
      router.refresh();
    } catch (e) {
      setError(actionMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-faint">Milestones</h2>
          <p className="mt-1 text-[15px] font-semibold">
            {goal === null ? "No goal set yet" : (
              <>
                {direction === "gain" ? "Up to" : direction === "hold" ? "Holding at" : "Down to"}{" "}
                <span className="tabular">{goal} {unit}</span>
              </>
            )}
          </p>
          {rungs.length > 0 && (
            <p className="mt-0.5 text-[12px] text-faint tabular">
              {hit} of {rungs.length} reached
              {next && ` · next, ${next.title.toLowerCase()}`}
            </p>
          )}
        </div>
        <button
          onClick={() => { setEditing(!editing); setAdding(false); }}
          aria-expanded={editing}
          className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-[12px] text-muted active:bg-raised"
        >
          {editing ? "Cancel" : goal === null ? "Set a goal" : "Edit goal"}
        </button>
      </div>

      {editing && (
        <div className="mb-4 space-y-3 rounded-xl border border-line bg-raised/50 p-3">
          <NumberField
            label={`Goal weight (${unit})`}
            value={weight}
            step={direction === "gain" ? 1 : 1}
            decimals
            min={0}
            max={2000}
            onChange={setWeight}
          />
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">By when (optional)</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-edge bg-surface px-3 py-2.5 text-[14px]"
            />
          </label>
          {/* Said out loud, because it is the whole point of changing it here:
              the rungs are rebuilt from the new number. Anything she has
              already reached stays reached. */}
          <p className="text-[11px] leading-relaxed text-faint">
            The milestones rebuild around the new goal. Ones you have already hit stay hit.
          </p>
          <button
            onClick={saveGoal}
            disabled={busy}
            className="w-full rounded-xl bg-accent py-2.5 text-[14px] font-semibold text-on-accent disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save goal"}
          </button>
        </div>
      )}

      {rungs.length === 0 && !editing && (
        <p className="text-[13px] leading-relaxed text-faint">
          {goal === null
            ? "Set a goal weight and the steps between here and there fill in — five pounds at a time."
            : "Your goal is about where you are now, so there is nothing to count down. Milestones you add yourself show up here."}
        </p>
      )}

      {rungs.length > 0 && (
        <ol className="space-y-1.5">
          {rungs.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5">
              <span
                aria-label={r.achieved ? "Reached" : undefined}
                aria-hidden={!r.achieved}
                className={`grid size-4 shrink-0 place-items-center rounded-full border text-[10px] ${
                  r.achieved ? "border-beat bg-beat text-on-accent"
                    : r.id === next?.id ? "border-accent text-transparent"
                      : "border-edge text-transparent"
                }`}
              >
                {r.achieved ? "✓" : ""}
              </span>
              <span className={`min-w-0 flex-1 truncate text-[13px] ${
                r.achieved ? "text-muted line-through" : r.id === next?.id ? "font-medium text-text" : "text-muted"
              }`}>
                {r.title}
              </span>
              <span className="shrink-0 text-[11px] text-faint tabular">
                {r.achieved && r.achievedOn ? r.achievedOn
                  : r.target !== null ? `${r.target} ${unit}`
                    : r.targetDate ?? ""}
              </span>
              {/* Only what she put there by hand. A rung of the ladder is
                  removed by moving the goal, not one at a time — deleting the
                  middle of a countdown leaves a countdown with a hole in it. */}
              {!r.auto && (
                <button
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  aria-label={`Remove ${r.title}`}
                  className="shrink-0 px-1 text-[16px] leading-none text-faint active:text-miss disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3">
        {adding ? (
          <div className="space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="First pull-up"
              aria-label="What the milestone is"
              className="w-full rounded-lg border border-edge bg-surface px-3 py-2.5 text-[14px]"
            />
            <div className="flex gap-2">
              <button onClick={addMilestone} disabled={busy || !title.trim()}
                className="flex-1 rounded-lg bg-accent py-2 text-[13px] font-semibold text-on-accent disabled:opacity-50">
                {busy ? "Adding…" : "Add"}
              </button>
              <button onClick={() => { setAdding(false); setTitle(""); }}
                className="rounded-lg border border-line px-3 py-2 text-[13px] text-muted">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setAdding(true); setEditing(false); }}
            className="text-[12px] text-accent active:opacity-70"
          >
            + Add one of your own
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
      {start !== null && current !== null && goal !== null && (
        <p className="mt-3 text-[11px] text-faint tabular">
          Started {start} {unit} · now {current} {unit} · goal {goal} {unit}
        </p>
      )}
    </section>
  );
}
