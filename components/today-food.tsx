"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import type { DayFoodView, RecentMeal } from "@/lib/views";

/**
 * What she has eaten today. Sits above the week's plan because the question
 * she actually has standing at the fridge is "where am I now", not "what was
 * I supposed to have on Thursday".
 */
export function TodayFood({ day, usuals }: { day: DayFoodView; usuals: RecentMeal[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-logging goes through log_meal with the macros she last recorded, so it
  // is the same write path as typing it out — just without the typing.
  async function logAgain(m: RecentMeal) {
    const key = `${m.slot}::${m.description}`;
    setLogging(key);
    // Cleared before the attempt: a failure from ten minutes ago sitting under
    // a successful log describes a problem that no longer exists.
    setError(null);
    // Minted once per tap and reused by a retry, so a response lost on the way
    // back cannot log her breakfast twice.
    const clientKey = crypto.randomUUID();
    try {
      await action("log_meal", {
        slot: m.slot,
        description: m.description,
        ...(m.calories !== null && { calories: m.calories }),
        ...(m.proteinG !== null && { proteinG: m.proteinG }),
        ...(m.fibreG !== null && { fibreG: m.fibreG }),
        clientKey,
      });
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't log — try again."));
    } finally {
      setLogging(null);
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    setError(null);
    try {
      await action("remove_meal_log", { logId: id });
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't come off the list — try again."));
    } finally {
      setRemoving(null);
    }
  }

  if (day.logged.length === 0) {
    return (
      <section className="card mb-3 p-5">
        <h2 className="text-[15px] font-semibold">Today&rsquo;s food</h2>
        <p className="mt-1 text-[13px] text-faint">
          Nothing logged yet. Add it below, work it out with the calculator, or just tell your coach.
        </p>

      <QuickAdd date={day.date} onDone={() => startTransition(() => router.refresh())} />

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}

      {usuals.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Log again</p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {usuals.map((m) => {
              const key = `${m.slot}::${m.description}`;
              return (
                <button
                  key={key}
                  onClick={() => void logAgain(m)}
                  disabled={logging === key}
                  className="shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-left text-[13px] active:bg-raised disabled:opacity-40"
                >
                  <span className="max-w-[190px] truncate">{m.description}</span>
                  {m.calories !== null && (
                    <span className="ml-1.5 text-faint tabular">{m.calories}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      </section>
    );
  }

  // Only a fully-counted day can be over target. A day whose lunch was typed
  // in words is a floor, and colouring a floor "over" — or, worse, leaving it
  // green at 900 when three meals carry no figures — is a claim we cannot make.
  const overCalories =
    day.calorieTarget !== null && day.caloriesComplete && day.calories > day.calorieTarget;

  return (
    <section className="card mb-3 p-5">
      <h2 className="mb-3 text-[15px] font-semibold">Today&rsquo;s food</h2>

      <div className="flex divide-x divide-line">
        <Stat
          label="Calories"
          value={`${day.caloriesComplete ? "" : "≥"}${day.calories}`}
          of={day.calorieTarget}
          tone={overCalories ? "over" : "on"}
        />
        <Stat
          label="Protein"
          value={`${day.caloriesComplete ? "" : "≥"}${day.proteinG}g`}
          of={day.proteinTargetG}
          suffix="g"
        />
        <Stat
          label="Fibre"
          // A total built from entries that carry no figure is a floor, not a
          // reading. Saying "12g" when lunch was typed in words claims
          // knowledge we do not have, and reads as failure at 30g.
          value={`${day.fibreComplete ? "" : "≥"}${day.fibreG}g`}
          of={day.fibreTargetG}
          suffix="g"
        />
      </div>

      {day.caloriesUnknownFor > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {day.caloriesUnknownFor} {day.caloriesUnknownFor === 1 ? "entry has" : "entries have"} no
          figures, so these are floors, not totals — the dashes below are the ones missing. Tell your
          coach roughly what was in them and it&rsquo;ll fill them in.
        </p>
      )}

      {day.caloriesUnknownFor === 0 && !day.fibreComplete && day.logged.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Fibre counts only what was looked up by name — anything described in words isn&rsquo;t in that total.
        </p>
      )}

      <ul className="mt-3 space-y-0.5">
        {day.logged.map((l) => (
          <li key={l.id} className="flex items-baseline gap-2 border-b border-line/60 py-2 last:border-0">
            <span className="w-[62px] shrink-0 text-[11px] uppercase tracking-wide text-accent">
              {l.slot}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px]">{l.description}</span>
            <span className="shrink-0 text-[12px] tabular text-muted">
              {l.calories ?? "—"}
              {l.proteinG !== null && ` · ${l.proteinG}g`}
            </span>
            <button
              onClick={() => void remove(l.id)}
              disabled={removing === l.id}
              aria-label={`Remove ${l.description}`}
              // A 14px icon with no vertical padding, next to the calorie figure, that
              // deleted a meal on contact. Now a proper thumb target.
              className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center text-faint transition-opacity active:text-miss disabled:opacity-30"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}

      {usuals.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Log again</p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {usuals.map((m) => {
              const key = `${m.slot}::${m.description}`;
              return (
                <button
                  key={key}
                  onClick={() => void logAgain(m)}
                  disabled={logging === key}
                  className="shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-left text-[13px] active:bg-raised disabled:opacity-40"
                >
                  <span className="max-w-[190px] truncate">{m.description}</span>
                  {m.calories !== null && (
                    <span className="ml-1.5 text-faint tabular">{m.calories}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <QuickAdd date={day.date} onDone={() => startTransition(() => router.refresh())} />
    </section>
  );
}


/**
 * Add a meal by typing it.
 *
 * The coach does this better — "two eggs on toast" and it works out the
 * numbers — but the only way to add food from this screen used to be a hint
 * that disappeared as soon as the day had anything in it. A manual row that
 * is always there costs nothing and removes the one moment where the screen
 * says "you cannot do that here".
 *
 * Calories are optional on purpose. A meal logged in words carries no figure,
 * and the day's total says so rather than counting it as zero — that is the
 * rule this whole app is built on, and forcing a number here would break it
 * by making her invent one.
 */
function QuickAdd({ date, onDone }: { date: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<"breakfast" | "lunch" | "dinner" | "snack">("snack");
  const [what, setWhat] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const said = what.trim();
    if (!said) return;
    setBusy(true);
    setError(null);
    const kcal = Number(calories);
    const g = Number(protein);
    try {
      await action("log_meal", {
        slot, description: said, date,
        ...(calories.trim() && Number.isFinite(kcal) ? { calories: kcal } : {}),
        ...(protein.trim() && Number.isFinite(g) ? { proteinG: g } : {}),
      });
      setWhat(""); setCalories(""); setProtein(""); setOpen(false);
      onDone();
    } catch (err) {
      setError(actionMessage(err, "That didn't log — try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl border border-dashed border-line py-3 text-[13px] text-muted active:bg-raised"
      >
        + Add food
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-raised p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(["breakfast", "lunch", "dinner", "snack"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSlot(s)}
            aria-pressed={slot === s}
            className={`rounded-full border px-3 py-1.5 text-[12px] capitalize transition-colors ${
              slot === s ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <input
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        placeholder="What did you eat?"
        aria-label="What did you eat"
        autoFocus
        className="w-full rounded-lg border border-edge bg-base px-3 py-2.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          inputMode="numeric"
          placeholder="kcal (optional)"
          aria-label="Calories, optional"
          className="rounded-lg border border-edge bg-base px-3 py-2 text-[14px] tabular placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <input
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          inputMode="numeric"
          placeholder="protein g (optional)"
          aria-label="Protein in grams, optional"
          className="rounded-lg border border-edge bg-base px-3 py-2 text-[14px] tabular placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Leave the numbers blank if you don&rsquo;t know them — the day shows a floor rather
        than counting it as nothing. Your coach can work them out for you.
      </p>
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={busy || !what.trim()}
          className="flex-1 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-ink disabled:opacity-40"
        >
          {busy ? "Logging…" : "Log it"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-xl border border-line px-4 py-2.5 text-[13px] text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Stat({
  label, value, of, suffix = "", tone = "on",
}: {
  label: string; value: string; of: number | null; suffix?: string; tone?: "on" | "over";
}) {
  return (
    <div className="flex-1 px-3 first:pl-0 last:pr-0">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className={`text-lg font-semibold tabular ${tone === "over" ? "text-miss" : ""}`}>{value}</p>
      {of !== null && (
        <p className="text-[11px] text-faint tabular">
          of {of}
          {suffix}
        </p>
      )}
    </div>
  );
}
