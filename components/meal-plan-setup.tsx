"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { useDialog } from "@/lib/use-dialog";
import { Chips, Field, DIETS, COOKING } from "./plan-setup";
import { DAY_NAMES } from "@/lib/date";

/**
 * Write the food again — a day of it, or the whole week.
 *
 * The week's write-up is where this lives because that is where the reason to
 * do it usually appears: "since cooking confidence wasn't specified, I've kept
 * everything to simple assembly" is the plan telling her the questionnaire has
 * an answer it never got.
 *
 * Deliberately the *food* questions and not the full setup. The training
 * questionnaire rebuilds her training week as its first act, which is a
 * surprising thing to happen to somebody who asked for different dinners.
 *
 * One day is the common case once a week exists — a Thursday she is out, a
 * Sunday she wants to cook properly — and it leaves every other day alone,
 * with the recipes already written against them.
 */
export function MealPlanSetup({
  defaults, todayIndex,
}: {
  defaults: {
    dietaryRestrictions: string[];
    dislikedFoods: string[];
    cookingSkill: "minimal" | "comfortable" | "keen" | null;
    calorieTarget: number | null;
    proteinTargetG: number | null;
  };
  /** 0=Monday, so "today" can be the first thing offered. */
  todayIndex: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-muted active:bg-raised"
      >
        Write this again
      </button>
      {open && (
        <Sheet
          defaults={defaults}
          todayIndex={todayIndex}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}

function Sheet({
  defaults, todayIndex, onClose, onDone,
}: {
  defaults: MealDefaults;
  todayIndex: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const panel = useDialog(onClose);
  const [scope, setScope] = useState<"week" | "day">("week");
  const [day, setDay] = useState(todayIndex);
  const [diets, setDiets] = useState<string[]>(defaults.dietaryRestrictions);
  const [dislikes, setDislikes] = useState(defaults.dislikedFoods.join(", "));
  const [cooking, setCooking] = useState(defaults.cookingSkill);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      // Her answers first, so they are on the profile whether or not the
      // planner call succeeds — she should not have to type them twice.
      await action("update_profile", {
        dietaryRestrictions: diets,
        dislikedFoods: dislikes.split(",").map((d) => d.trim()).filter(Boolean),
        ...(cooking === null ? {} : { cookingSkill: cooking }),
      });
      if (defaults.calorieTarget === null || defaults.proteinTargetG === null) {
        throw new Error("Set your calorie and protein targets first — your coach can work them out.");
      }
      await action("create_meal_plan", {
        calorieTarget: defaults.calorieTarget,
        proteinTargetG: defaults.proteinTargetG,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(scope === "day" ? { days: [day] } : {}),
      });
      onDone();
    } catch (err) {
      setError(actionMessage(err, "Your coach couldn't write that just now."));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-scrim/70 backdrop-blur-sm sm:place-items-center">
      <div
        {...panel}
        aria-label="Write the meal plan again"
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 sm:max-w-md sm:rounded-2xl"
      >
        <h2 className="text-[16px] font-semibold">Write the food again</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Your answers are kept, so the planner stops guessing at them.
        </p>

        <div className="mt-4 space-y-4">
          <Field label="How much of it?">
            <Chips
              options={["The whole week", "One day"]}
              value={[scope === "week" ? "The whole week" : "One day"]}
              onPick={(v) => setScope(v === "One day" ? "day" : "week")}
            />
          </Field>
          {scope === "day" && (
            <Field label="Which day">
              {/* Everything else keeps the meals it has, and the recipes
                  already written against them. */}
              <Chips
                options={[...DAY_NAMES]}
                value={[DAY_NAMES[day]]}
                onPick={(v) => setDay(DAY_NAMES.indexOf(v as (typeof DAY_NAMES)[number]))}
              />
            </Field>
          )}
          <Field label="Anything you don't eat">
            <Chips
              multi
              options={DIETS}
              value={diets}
              onPick={(v) => setDiets((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]))}
            />
          </Field>
          <Field label="Foods you'd rather not see">
            <input
              value={dislikes}
              onChange={(e) => setDislikes(e.target.value)}
              placeholder="mushrooms, olives…"
              aria-label="Foods you would rather not see"
              className="w-full rounded-lg border border-edge bg-base px-3 py-2.5 text-[14px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="How much do you want to cook?">
            <Chips
              options={COOKING.map((c) => c.label)}
              value={COOKING.filter((c) => c.value === cooking).map((c) => c.label)}
              onPick={(v) => setCooking(COOKING.find((c) => c.label === v)?.value ?? null)}
            />
          </Field>
          <Field label="Anything else">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="busy week, cooking for two…"
              aria-label="Anything else the planner should know"
              className="w-full rounded-lg border border-edge bg-base px-3 py-2.5 text-[14px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </Field>
        </div>

        {error && <p role="alert" className="mt-3 text-[12.5px] text-miss">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={build}
            disabled={busy}
            className="flex-1 rounded-xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-50"
          >
            {busy
              ? "Writing it…"
              : scope === "day" ? `Write ${DAY_NAMES[day]} again` : "Write the week again"}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-line px-4 py-3 text-[14px] text-muted disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type MealDefaults = React.ComponentProps<typeof MealPlanSetup>["defaults"];
