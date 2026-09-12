"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import type { DayFoodView, SavedMeal } from "@/lib/views";
import { gramsForCalories } from "@/lib/nutrition";
import { afterLogLine, macroBar, type MacroRow } from "@/lib/macro-progress";
import { MacroBars } from "./macro-bars";
import { RecipeScan } from "./recipe-scan";

/**
 * What she has eaten today. Sits above the week's plan because the question
 * she actually has standing at the fridge is "where am I now", not "what was
 * I supposed to have on Thursday".
 */
export function TodayFood({
  day, saved, isToday = true, water, defaultSlot,
}: {
  day: DayFoodView;
  saved: SavedMeal[];
  isToday?: boolean;
  /** The meal she is most likely logging right now, from the hour where she
   *  is. The photo panel opens on it, the same as the typed form does. */
  defaultSlot: "breakfast" | "lunch" | "dinner" | "snack";
  /** Water as the sixth bar, and the vessels that fill it. */
  water: {
    row: MacroRow;
    presets: { ml: number; label: string }[];
    anythingLogged: boolean;
  };
}) {
  // The screen steps back a day at a time; the heading has to follow it.
  const heading = isToday ? "Today\u2019s food" : "That day\u2019s food";
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The four figures as bars, judged in one place — see lib/macro-progress.ts.
   * Carbs and fat carry their own completeness flag because a meal typed in
   * words has no macro split, and counting it as zero grams of fat is the same
   * lie as counting it as zero calories.
   */
  const macroRows: MacroRow[] = [
    { key: "calories", label: "Calories", value: day.calories, target: day.calorieTarget, complete: day.caloriesComplete, suffix: "" },
    { key: "protein", label: "Protein", value: day.proteinG, target: day.proteinTargetG, complete: day.proteinComplete, suffix: "g" },
    { key: "carbs", label: "Carbs", value: day.carbsG, target: day.carbTargetG, complete: day.carbsComplete, suffix: "g" },
    { key: "fat", label: "Fat", value: day.fatG, target: day.fatTargetG, complete: day.fatComplete, suffix: "g" },
    // Fibre is a macro like the rest of them now: the coach estimates it when
    // the lookup misses, exactly as it estimates carbs and fat, so a day is
    // rarely a floor any more. The "≥" is still there for the days it is.
    { key: "fibre", label: "Fibre", value: day.fibreG, target: day.fibreTargetG, complete: day.fibreComplete, suffix: "g" },
    /*
      And water, the sixth.

      It had its own card with its own meter, its own verdict sentence and its
      own idea of what "close" meant — a second, worse drawing of the picture
      these bars already make five times over. It is a number with a daily
      target, which is what this list is. A day with nothing written down is a
      floor here exactly as it is for calories: hatched, and no verdict.
    */
    water.row,
  ];

  /**
   * What to say after something is logged, held until she moves on.
   *
   * Keyed off the day's own totals rather than set by the thing that logged:
   * the entry is written, the route refreshes, and the totals coming back
   * different from the ones this rendered with is exactly the event worth
   * marking — including when the coach logged it rather than the form.
   */

  const stamp = `${day.logged.length}:${day.calories}:${day.proteinG}`;
  const [seen, setSeen] = useState(stamp);
  const [logged, setLogged] = useState<{ text: string; tone: "good" | "warn" | "plain" } | null>(null);
  if (stamp !== seen) {
    setSeen(stamp);
    setLogged(day.logged.length > 0 ? afterLogLine(macroRows.map(macroBar)) : null);
  }

  // Re-logging goes through log_meal with the macros she last recorded, so it
  // is the same write path as typing it out — just without the typing.
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
        <h2 className="text-[15px] font-semibold">{heading}</h2>
        <p className="mt-1 text-[13px] text-faint">
          Nothing logged yet. Add it below, work it out with the calculator, or just tell your coach.
        </p>

        {/*
          Water on its own, when it is the only thing with anything in it.

          This branch returns before the bars, so folding water into that list
          would have hidden the one meter that *does* have a figure on exactly
          the day she has drunk three glasses and eaten nothing she wrote down.
          The food bars stay away: there is genuinely nothing to say about them.
        */}
        {water.anythingLogged && (
          <div className="mt-3 rounded-xl border border-line bg-raised p-3">
            <MacroBars rows={[water.row]} />
          </div>
        )}

      <QuickAdd date={day.date} saved={saved} water={water} slot={defaultSlot} onDone={() => startTransition(() => router.refresh())} />

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}

      </section>
    );
  }

  // The "only a fully-counted day can be over target" rule used to live here,
  // for the grid of numbers. It lives in macroBar now — one judgement for the
  // bars, the logging moment and Progress — and a floor gets a bar with no
  // colour rather than a verdict it has not earned.

  return (
    <section className="card mb-3 p-5">
      <h2 className="mb-3 text-[15px] font-semibold">{heading}</h2>

      {/*
        What just happened to the day, the moment something is logged.

        The session-done screen is the model, but it is not a full screen here
        on purpose: a workout ends once and a meal is logged four or five times
        a day, and a takeover that often stops being a reward and becomes a
        thing to dismiss. It is loud enough to notice, it says the one true
        thing, and it goes when she taps the tally or logs the next thing.

        Going over is never scolded. It is information for the next meal, and
        "you are over" said warmly at four in the afternoon is the difference
        between logging dinner and not logging it — which is the only thing
        that actually breaks a food diary.
      */}
      {logged && (
        <div className={`mb-3 rounded-xl border p-3 ${
          logged.tone === "warn" ? "border-miss/40 bg-miss-soft"
            : logged.tone === "good" ? "border-beat/40 bg-beat-soft"
              : "border-line bg-raised"
        }`}>
          <p className={`text-[13px] font-medium ${
            logged.tone === "warn" ? "text-miss" : logged.tone === "good" ? "text-beat" : "text-text"
          }`}>
            {logged.text}
          </p>
          <div className="mt-2.5">
            <MacroBars rows={macroRows} compact />
          </div>
        </div>
      )}

      {/*
        The bars *are* the tally.

        There was a grid of five numbers with the same five bars hidden behind
        a tap on it — the numbers saying where she is and the bars saying how
        far that is, which is one fact drawn twice and a control in the way of
        the better half. The bars carry the figure, the target and the distance
        in one line each.
      */}
      {!logged && (
        <div className="rounded-xl border border-line bg-raised p-3">
          <MacroBars rows={macroRows} />
        </div>
      )}

      {/*
        Nothing here explains the hatching.

        There were three goes at it: a paragraph, then a line naming every
        macro and counting each one, then a button to fix it. All of that over
        a bar that already writes `\u2265` and is already drawn hatched. The
        `fill_macro_gaps` tool still exists and the coach can still run it —
        "fill in my macros" — it just is not furniture on the screen.
      */}

      <ul className="mt-3 space-y-0.5">
        {day.logged.map((l) => (
          <li key={l.id} className="border-b border-line/60 py-2 last:border-0">
            <div className="flex items-baseline gap-2">
              <span className="w-[62px] shrink-0 text-[11px] uppercase tracking-wide text-accent">
                {l.slot}
              </span>
              {/* Tapping the entry edits it. "Delete it and log it again" is
                  not a correction — it loses the time it was eaten and makes
                  fixing a number feel like a mistake being punished. */}
              {/* The name gets the row on a phone and the four figures the one
                  under it. Side by side, the numbers were `shrink-0` and the
                  name was the half that could give — so a plate logged as
                  "pulled pork, cheese cubes, pickles, bbq sauce" came out as
                  "p…". Four macros is more width than a name can spare at
                  360px, and the name is what she is scanning for. */}
              <button
                onClick={() => setEditing(editing === l.id ? null : l.id)}
                aria-expanded={editing === l.id}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left sm:flex-row sm:items-baseline sm:gap-2"
              >
                <span className="min-w-0 text-[14px] sm:flex-1 sm:truncate">{l.description}</span>
                <span className="shrink-0 text-[12px] tabular text-muted">
                  {l.calories ?? "—"}
                  {l.proteinG !== null && ` · ${l.proteinG}p`}
                  {l.carbsG !== null && ` · ${l.carbsG}c`}
                  {l.fatG !== null && ` · ${l.fatG}f`}
                </span>
              </button>
              {/*
                Keep it for next time.
                A rolling window of last week's food was the old answer and it
                was not a favourites list — the porridge she has every single
                morning was never on it twice in the same form, and the thing
                she had once in a fortnight was. This is hers to choose.
              */}
              <SaveMeal log={l} saved={saved} onDone={() => startTransition(() => router.refresh())} />
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
            </div>
            {editing === l.id && (
              <EditLog
                log={l}
                onDone={() => { setEditing(null); startTransition(() => router.refresh()); }}
                onCancel={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ul>

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}


      <QuickAdd date={day.date} saved={saved} water={water} slot={defaultSlot} onDone={() => startTransition(() => router.refresh())} />
    </section>
  );
}


/**
 * The bookmark on a logged entry.
 *
 * Filled when this is already one of her regulars, hollow when it is not, and
 * a tap in either direction. The state is what makes it worth having: an icon
 * that always looks the same is a button you have to remember pressing.
 */
function SaveMeal({
  log, saved, onDone,
}: {
  log: { slot: string; description: string; calories: number | null; proteinG: number | null; fibreG: number | null };
  saved: SavedMeal[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const already = saved.some(
    (m) => m.description.toLowerCase() === log.description.trim().toLowerCase(),
  );

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (already) {
        await action("remove_saved_meal", { description: log.description });
      } else {
        await action("save_meal", {
          slot: log.slot,
          description: log.description,
          // Passed through as-is, nulls included: a meal typed in words has
          // no figures and the saved copy should say so rather than claim
          // zero. save_meal takes null for exactly this.
          calories: log.calories,
          proteinG: log.proteinG,
          fibreG: log.fibreG,
        });
      }
      onDone();
    } catch (err) {
      setError(actionMessage(err, "Couldn't save that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative">
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={already}
        aria-label={already ? `Stop saving ${log.description}` : `Save ${log.description} for next time`}
        title={already ? "One of your regulars" : "Save for next time"}
        className={`-my-2 grid size-11 shrink-0 place-items-center transition-colors disabled:opacity-30 ${
          already ? "text-accent" : "text-faint hover:text-muted"
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.9" strokeLinecap="round"
          strokeLinejoin="round" stroke="currentColor" fill={already ? "currentColor" : "none"} aria-hidden>
          <path d="M6 4h12v17l-6-4-6 4V4Z" />
        </svg>
      </button>
      {error && (
        <span role="alert" className="absolute right-0 top-10 z-10 w-40 rounded-lg border border-miss/40 bg-miss-soft px-2 py-1 text-[11px] text-miss">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * Fix an entry that is already in.
 *
 * Deleting and re-logging was the only way to change a number, which loses
 * when it was eaten and makes correcting a figure feel like being told off
 * for getting it wrong the first time. Blank is a real value here: clearing
 * the calories records that we do not know them, which is what the day's
 * total already says out loud with a "≥".
 */
function EditLog({
  log, onDone, onCancel,
}: {
  log: {
    id: string; description: string;
    calories: number | null; proteinG: number | null;
    carbsG: number | null; fatG: number | null; fibreG: number | null;
  };
  onDone: () => void;
  onCancel: () => void;
}) {
  const [what, setWhat] = useState(log.description);
  const [macros, setMacros] = useState<Macros>(() => fromLog(log));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await action("update_meal_log", {
        logId: log.id,
        description: what.trim() || log.description,
        // Null, not zero, when she clears one: the day counts an unknown as a
        // floor rather than as nothing eaten. Every macro, not just the two
        // the form used to ask for.
        ...asNulls(macros),
      });
      onDone();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-line bg-raised p-3">
      <input
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        aria-label="What it was"
        className="w-full rounded-lg border border-edge bg-base px-3 py-2.5 text-[15px] focus:border-accent focus:outline-none"
      />
      <div className="mt-2">
        <FoodNumbers value={macros} onChange={setMacros} describes={what} />
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-on-accent disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} disabled={busy}
          className="rounded-xl border border-line px-4 py-2.5 text-[13px] text-muted disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Calories and protein, with a way to have either worked out.
 *
 * "Cheese" has a calorie figure and a protein figure that anyone with a food
 * table can find, and she should not have to. One button fills whichever box
 * is empty and leaves alone whatever she has already typed — so "300 cal of
 * cheese" gets the protein for that portion, a bare description gets both,
 * and a figure she entered herself is never overwritten by an estimate.
 *
 * Behind a tap rather than automatic: it is a lookup she may not want, the
 * numbers land in editable boxes so she can overrule them, and a figure the
 * app quietly invented and she never checked is exactly the kind of made-up
 * data it refuses to produce anywhere else.
 */
/** The five figures a meal can carry, as strings so "" means "she did not say". */
export type Macros = { calories: string; protein: string; carbs: string; fat: string; fibre: string };
export const NO_MACROS: Macros = { calories: "", protein: "", carbs: "", fat: "", fibre: "" };

/** What the tools call each of them. */
const FIELD = {
  calories: "calories", protein: "proteinG", carbs: "carbsG", fat: "fatG", fibre: "fibreG",
} as const;

const asNumber = (v: string): number | null => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
};

/**
 * Only what she filled in, for logging. A blank is left out of the call
 * entirely rather than sent as zero — unknown is not zero, and the day counts
 * a missing figure as a floor instead of as nothing eaten.
 */
export function asGiven(m: Macros): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(FIELD) as (keyof Macros)[]) {
    const n = asNumber(m[k]);
    if (n !== null) out[FIELD[k]] = n;
  }
  return out;
}

/**
 * Every field, for correcting. Here a blank is sent as an explicit null —
 * clearing a number she had put in has to be able to make it unknown again,
 * which leaving it out could not say.
 */
export function asNulls(m: Macros): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const k of Object.keys(FIELD) as (keyof Macros)[]) out[FIELD[k]] = asNumber(m[k]);
  return out;
}

const show = (n: number | null) => (n === null ? "" : String(n));

export const fromLog = (l: {
  calories: number | null; proteinG: number | null;
  carbsG: number | null; fatG: number | null; fibreG: number | null;
}): Macros => ({
  calories: show(l.calories), protein: show(l.proteinG),
  carbs: show(l.carbsG), fat: show(l.fatG), fibre: show(l.fibreG),
});

/**
 * The numbers on a meal, all five of them.
 *
 * It asked for calories and protein only, which made the manual form the one
 * place in the app that could not record a whole meal — the coach has logged
 * carbs and fat for a while, the day totals them, and the bars draw them, so a
 * meal typed in by hand arrived permanently incomplete and turned the day into
 * a floor. Every macro the day counts can be typed here.
 *
 * Blank still means blank. None of these is required and none defaults to
 * zero: a meal she cannot put numbers to is logged without them and the day
 * says so, which is the rule the whole app is built on.
 */
function FoodNumbers({
  value, onChange, describes,
}: {
  value: Macros;
  onChange: (v: Macros) => void;
  describes: string;
}) {
  const set = (k: keyof Macros) => (v: string) => onChange({ ...value, [k]: v });
  const { calories } = value;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const wantsCalories = calories.trim() === "";
  /** Which of the five she has left for the lookup to fill in. */
  const blanks = (Object.keys(NO_MACROS) as (keyof Macros)[]).filter((k) => value[k].trim() === "");

  async function estimate() {
    const food = describes.trim();
    if (!food || blanks.length === 0) return;
    setBusy(true);
    setFailed(false);
    try {
      // The food as she wrote it, and nothing else. Building a query like
      // "300 kcal cheese" reads to the portion parser as 300 of a unit called
      // "kcal": no library match, and a syntax the app invented handed to the
      // model to interpret. Her calorie figure is applied here instead, as
      // arithmetic — see proteinForCalories.
      const r = await action<{
        found: boolean; kcal?: number;
        proteinG?: number; carbsG?: number; fatG?: number; fibreG?: number;
      }>("lookup_food", { query: food });
      const num = (v: unknown) => (typeof v === "number" ? v : null);
      const refKcal = num(r.kcal);

      const next = { ...value };
      let filled = false;
      if (blanks.includes("calories") && r.found && refKcal !== null) {
        next.calories = String(Math.round(refKcal));
        filled = true;
      }
      // Each gram figure scaled to her portion when she gave a calorie figure;
      // otherwise the reference portion's own, alongside the calories just
      // filled in for that same portion.
      for (const [key, ref] of [
        ["protein", num(r.proteinG)], ["carbs", num(r.carbsG)],
        ["fat", num(r.fatG)], ["fibre", num(r.fibreG)],
      ] as const) {
        if (!blanks.includes(key) || !r.found || ref === null) continue;
        const hers = wantsCalories
          ? Math.round(ref)
          : gramsForCalories(ref, refKcal ?? 0, Number(calories));
        if (hers === null) continue;
        next[key] = String(hers);
        filled = true;
      }
      if (filled) onChange(next);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // "Calculate". It was "estimate protein" / "work out the rest" — three
  // phrasings of one button, and none of them said the thing the button is:
  // the calculator, on what she has typed.
  const label = blanks.length === 0 ? "nothing left to calculate" : "calculate";

  /*
    A label that stays, above the box.

    They were placeholders, which is the oldest trap in a form: the word
    disappears the moment there is a value in the field, so the instant the
    calculator fills all five in she is looking at five numbers and no way to
    tell which is fat. The label sits above now and never moves.
  */
  const box = (k: keyof Macros, label: string, unit: string) => (
    <label key={k} className="block min-w-0">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <input
        value={value[k]}
        onChange={(e) => { set(k)(e.target.value); setFailed(false); }}
        inputMode="numeric"
        // No "(optional)". None of these five is required — that is the rule
        // the whole screen is built on — and saying it on two of them implied
        // the other three were not.
        placeholder={unit}
        className="w-full rounded-lg border border-edge bg-base px-3 py-2 text-[14px] tabular placeholder:text-faint focus:border-accent focus:outline-none"
      />
    </label>
  );

  return (
    <div>
      {/* The two that drive every target on their own row, and the three that
          fill in the picture under them — five equal boxes across a phone
          would be five numbers nobody can read. */}
      <div className="grid grid-cols-2 gap-2">
        {box("calories", "Calories", "kcal")}
        {box("protein", "Protein", "g")}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {box("carbs", "Carbs", "g")}
        {box("fat", "Fat", "g")}
        {box("fibre", "Fibre", "g")}
      </div>
      {/* Under the pair, not inside a field: half a grid column is not much
          room for a number and a word, and the button ran into the
          placeholder on a narrow phone. */}
      <button
        type="button"
        onClick={estimate}
        disabled={busy || !describes.trim() || blanks.length === 0}
        className="mt-1 px-1 text-[11px] font-medium text-accent underline underline-offset-2 disabled:no-underline disabled:opacity-30"
      >
        {busy ? "working it out…" : failed ? "no match — type it" : label}
      </button>
    </div>
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
function QuickAdd({
  date, saved, water, slot: defaultSlot, onDone,
}: {
  date: string;
  saved: SavedMeal[];
  water: { presets: { ml: number; label: string }[]; anythingLogged: boolean };
  /** The meal she is most likely logging now — the photo panel opens on it. */
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  /*
    Water goes on the day from the same place food does.

    It was a whole card of its own further down the screen, which is two
    scrolls from the moment she is actually in — she is at the fridge, she has
    just eaten, and the glass went with it. Same row, same shape: the vessels
    open where the food form opens.
  */
  const [pouring, setPouring] = useState(false);
  const [slot, setSlot] = useState<"breakfast" | "lunch" | "dinner" | "snack">("snack");
  const [what, setWhat] = useState("");
  const [macros, setMacros] = useState<Macros>(NO_MACROS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** One tap: a regular goes in with the numbers she gave it. */
  async function logSaved(m: SavedMeal) {
    setBusy(true);
    setError(null);
    try {
      await action("log_meal", {
        slot: m.slot, description: m.description, date,
        // Only what is actually known. A saved "leftovers" carries no
        // figures, and sending zero would count it as a zero-calorie meal.
        ...(m.calories === null ? {} : { calories: m.calories }),
        ...(m.proteinG === null ? {} : { proteinG: m.proteinG }),
        ...(m.fibreG === null ? {} : { fibreG: m.fibreG }),
      });
      onDone();
    } catch (err) {
      setError(actionMessage(err, "That didn't log — try again."));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const said = what.trim();
    if (!said) return;
    setBusy(true);
    setError(null);
    try {
      await action("log_meal", {
        slot, description: said, date,
        // Only what she actually filled in. A blank is left out entirely
        // rather than sent as zero — see asGiven.
        ...asGiven(macros),
      });
      setWhat(""); setMacros(NO_MACROS); setOpen(false);
      onDone();
    } catch (err) {
      setError(actionMessage(err, "That didn't log — try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      // Two ways to put food on the day, side by side, where the day is.
      // Typing it is the fast one for "protein shake, 147"; the coach is the
      // one for a plate with four things on it — and it used to live at the
      // bottom of the screen, past everything, which is a scroll away from
      // the moment she is actually in.
      <>
        {/* Three ways to put food on the day, and the coach. The camera was a
            card of its own with a heading and a paragraph, two scrolls down —
            it is a third way to add food and it belongs in the row with the
            other two. `flex-wrap` is what lets its panel drop to its own line
            when there is one. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => { setOpen(true); setPouring(false); }}
            className="flex-1 rounded-xl border border-dashed border-line py-3 text-[13px] text-muted active:bg-raised"
          >
            + Add food
          </button>
          <button
            onClick={() => setPouring(!pouring)}
            aria-expanded={pouring}
            className={`flex-1 rounded-xl border border-dashed py-3 text-[13px] transition-colors active:bg-raised ${
              pouring ? "border-accent text-accent" : "border-line text-muted"
            }`}
          >
            + Water
          </button>
          <RecipeScan defaultSlot={defaultSlot} />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("coach:open"))}
            aria-label="Tell your coach what you ate"
            title="Tell your coach what you ate"
            className="grid w-12 shrink-0 place-items-center rounded-xl border border-dashed border-line text-muted transition-colors active:bg-raised hover:text-accent"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8a10 10 0 0 1-2.6-.34L4 21l1.2-3.6A7.5 7.5 0 0 1 3 11c0-4.42 4.03-8 9-8Z" />
            </svg>
          </button>
        </div>
        {pouring && (
          <Water
            date={date}
            presets={water.presets}
            anythingLogged={water.anythingLogged}
            onDone={onDone}
          />
        )}
      </>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-raised p-3">
      {saved.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-faint">Your regulars</p>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {saved.map((m) => (
              <button
                key={m.id}
                onClick={() => void logSaved(m)}
                disabled={busy}
                className="shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-left text-[13px] active:bg-raised disabled:opacity-40"
              >
                <span className="max-w-[180px] truncate">{m.description}</span>
                {m.calories !== null && <span className="ml-1.5 text-faint tabular">{m.calories}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

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
      <div className="mt-2">
        <FoodNumbers value={macros} onChange={setMacros} describes={what} />
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={busy || !what.trim()}
          className="flex-1 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-on-accent disabled:opacity-40"
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


/**
 * The vessels, where the food form is.
 *
 * One tap per glass, because that is the only interaction anybody does eight
 * times in a day. Typing is for the times it is not a glass, and undo is there
 * because the eighth tap is the one that lands twice.
 *
 * No meter of its own: the bar above is the meter, and this is only the way to
 * move it. That was the whole problem with the card this replaced.
 */
function Water({
  date, presets, anythingLogged, onDone,
}: {
  date: string;
  presets: { ml: number; label: string }[];
  anythingLogged: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  async function run(key: string, call: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await call();
      setTyped("");
      onDone();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-line bg-raised p-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.ml}
            onClick={() => void run(String(p.ml), () => action("log_water", { amount: `${p.ml}ml`, date }))}
            disabled={busy !== null}
            className="flex-1 rounded-lg border border-edge bg-surface py-2.5 text-[13px] font-medium text-accent transition-colors active:bg-raised disabled:opacity-40"
          >
            {busy === String(p.ml) ? "…" : `+ ${p.label}`}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const said = typed.trim();
            if (said) void run("typed", () => action("log_water", { amount: said, date }));
          }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="330ml, 1.5L, 16oz, a pint"
            aria-label="How much you drank"
            className="min-w-0 flex-1 rounded-lg border border-edge bg-base px-3 py-2 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy !== null || !typed.trim()}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12.5px] text-muted disabled:opacity-40"
          >
            {busy === "typed" ? "…" : "Add"}
          </button>
        </form>
        {anythingLogged && (
          <button
            onClick={() => void run("undo", () => action("remove_water_log", { date }))}
            disabled={busy !== null}
            className="shrink-0 rounded-full px-2 py-1 text-[12px] text-faint underline underline-offset-2 disabled:opacity-40"
          >
            {busy === "undo" ? "…" : "Undo last"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
    </div>
  );
}

