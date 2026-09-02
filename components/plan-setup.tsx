"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { useDialog } from "@/lib/use-dialog";

/**
 * The guided setup: a handful of taps, then a real week and real meals.
 *
 * It runs itself the first time — the invitation on the home screen — and it
 * runs again whenever she asks, because what she can commit to in January is
 * not what she can commit to in June. "I've only got three days now" should
 * rebuild the week, not leave her failing a plan written for a different life.
 *
 * Skipping is a first-class answer, and it is remembered: the invitation goes
 * away and the setup stays available. Nothing here is a form she must finish —
 * every answer defaults to what her profile already says.
 */

const FOCUS = [
  "full body", "legs and glutes", "upper body", "core",
  "arms", "back", "chest", "shoulders", "conditioning", "mobility",
];
const EQUIPMENT = [
  "dumbbells", "resistance bands", "bench", "kettlebell",
  "pull-up bar", "full gym", "bodyweight only",
];
const LIMITS = ["knees", "lower back", "shoulders", "wrists", "neck", "hips"];
const DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "pescatarian", "halal", "kosher"];
const COOKING: { value: "minimal" | "comfortable" | "keen"; label: string }[] = [
  { value: "minimal", label: "Barely cook" },
  { value: "comfortable", label: "Can cook" },
  { value: "keen", label: "Love cooking" },
];

export type SetupDefaults = {
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  equipment: string[];
  injuries: string[];
  dietaryRestrictions: string[];
  dislikedFoods: string[];
  cookingSkill: "minimal" | "comfortable" | "keen" | null;
};

/** The one-time invitation. Shown until she runs the setup or says not now. */
export function PlanSetupInvite({ defaults }: { defaults: SetupDefaults }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function notNow() {
    setDismissing(true);
    setError(null);
    try {
      await action("skip_plan_setup");
      router.refresh();
    } catch {
      // It used to leave `dismissing` set forever, so offline the button greyed
      // out permanently and the invitation stayed — dismissed and undismissable.
      setError("Couldn't save that just now — it'll ask again.");
      setDismissing(false);
    }
  }

  return (
    <>
      <section className="card mb-4 border-accent/40 p-4">
        <h2 className="text-[15px] font-semibold">Build your plan together</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          A few taps — how often you train, what you want to work, what you&rsquo;ll actually cook —
          and your coach writes the week and the meals around it.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-ink"
          >
            Let&rsquo;s do it
          </button>
          <button
            onClick={notNow}
            disabled={dismissing}
            className="rounded-full border border-line px-4 py-2 text-[13px] text-muted disabled:opacity-50"
          >
            Not now
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
      </section>
      {open && <PlanSetupSheet defaults={defaults} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The any-time entry point, for the settings end of the Progress screen. */
export function PlanSetupButton({ defaults }: { defaults: SetupDefaults }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="card mb-3 p-5">
        <h2 className="text-[15px] font-semibold">Your plan setup</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Training on different days, working different muscles, cooking more or less than you were —
          run it again and the week is rebuilt around the answers.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded-full border border-line px-4 py-2 text-[13px] text-accent active:bg-raised"
        >
          Run setup
        </button>
      </section>
      {open && <PlanSetupSheet defaults={defaults} onClose={() => setOpen(false)} />}
    </>
  );
}

type Stage = null | "training" | "meals" | "done";

function PlanSetupSheet({ defaults, onClose }: { defaults: SetupDefaults; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<Stage>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ calorieTarget: number | null; proteinTargetG: number | null } | null>(null);

  const [daysPerWeek, setDays] = useState(defaults.daysPerWeek ?? 3);
  const [sessionMinutes, setMinutes] = useState(defaults.sessionMinutes ?? 45);
  const [focus, setFocus] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>(defaults.equipment);
  const [injuries, setInjuries] = useState<string[]>(defaults.injuries);
  const [diets, setDiets] = useState<string[]>(defaults.dietaryRestrictions);
  const [dislikes, setDislikes] = useState(defaults.dislikedFoods.join(", "));
  const [cooking, setCooking] = useState<SetupDefaults["cookingSkill"]>(defaults.cookingSkill);
  const [notes, setNotes] = useState("");

  // Escapable at every stage. It used to trap her: two model calls back to
  // back, no abort, no Close button while building, backdrop taps ignored —
  // a dropped signal meant up to two minutes on a bouncing-dot screen with no
  // way out but force-quitting, and no idea whether the plan had been written.
  const panel = useDialog(onClose);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  /**
   * Two requests, not one. Each planner call takes the best part of a minute
   * and the serverless function is capped at sixty seconds — run back to back
   * they blow the limit, and she ends up with half a plan and a spinner.
   */
  async function build() {
    setError(null);
    setStage("training");
    // action() carries its own deadline, so a stalled request surfaces as an
    // error here rather than as a spinner she cannot leave.
    try {
      const r = await action<{
        ok: boolean; planError?: string; calorieTarget: number | null; proteinTargetG: number | null;
      }>("run_plan_setup", {
        daysPerWeek, sessionMinutes,
        focus: focus.length ? focus : undefined,
        equipment: equipment.length ? equipment : undefined,
        injuries,
        dietaryRestrictions: diets,
        dislikedFoods: dislikes.split(",").map((d) => d.trim()).filter(Boolean),
        cookingSkill: cooking ?? undefined,
        notes: notes.trim() || undefined,
      });
      if (!r.ok) throw new Error(r.planError ?? "Your coach couldn't write the week.");

      if (r.calorieTarget !== null && r.proteinTargetG !== null) {
        setStage("meals");
        await action("create_meal_plan", {
          calorieTarget: r.calorieTarget,
          proteinTargetG: r.proteinTargetG,
          notes: notes.trim() || undefined,
        });
      }
      setSummary({ calorieTarget: r.calorieTarget, proteinTargetG: r.proteinTargetG });
      setStage("done");
      router.refresh();
    } catch (err) {
      // The training week may well have been written before this failed, so
      // say what happened rather than implying nothing was saved.
      setError(actionMessage(err, "Something went wrong building that."));
      setStage(null);
    }
  }

  const steps = [
    {
      title: "How often, and for how long?",
      body: (
        <>
          <Field label="Days a week">
            <Chips
              options={["1", "2", "3", "4", "5", "6", "7"]}
              value={[String(daysPerWeek)]}
              onPick={(v) => setDays(Number(v))}
            />
          </Field>
          <Field label="Minutes a session">
            <Chips
              options={["20", "30", "45", "60", "75"]}
              value={[String(sessionMinutes)]}
              onPick={(v) => setMinutes(Number(v))}
            />
          </Field>
        </>
      ),
    },
    {
      title: "What do you want to work?",
      hint: "Pick as many as you like, or none and your coach will balance it.",
      body: (
        <Chips options={FOCUS} value={focus} multi onPick={(v) => toggle(focus, setFocus, v)} />
      ),
    },
    {
      title: "What have you got to train with?",
      body: (
        <Chips options={EQUIPMENT} value={equipment} multi
          onPick={(v) => toggle(equipment, setEquipment, v)} />
      ),
    },
    {
      title: "Anything to work around?",
      hint: "Your coach picks different movements rather than telling you to push through.",
      body: (
        <Chips options={LIMITS} value={injuries} multi onPick={(v) => toggle(injuries, setInjuries, v)} />
      ),
    },
    {
      title: "And the food?",
      body: (
        <>
          <Field label="Anything you don't eat">
            <Chips options={DIETS} value={diets} multi onPick={(v) => toggle(diets, setDiets, v)} />
          </Field>
          <Field label="Foods you'd rather not see">
            <input
              value={dislikes}
              onChange={(e) => setDislikes(e.target.value)}
              placeholder="mushrooms, olives"
              className="w-full rounded-xl border border-line bg-base px-3.5 py-2.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="How much do you want to cook?">
            <Chips
              options={COOKING.map((c) => c.label)}
              value={COOKING.filter((c) => c.value === cooking).map((c) => c.label)}
              onPick={(label) => setCooking(COOKING.find((c) => c.label === label)?.value ?? null)}
            />
          </Field>
          <Field label="Anything else your coach should know">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="busy week, batch cooking, back on after a break"
              className="w-full rounded-xl border border-line bg-base px-3.5 py-2.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </Field>
        </>
      ),
    },
  ];

  const last = step === steps.length - 1;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Set up your plan"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/70 backdrop-blur-sm"
    >
      <div ref={panel}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5"
        data-no-pull-to-refresh=""
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
        {stage === null && (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-accent">
                  Step {step + 1} of {steps.length}
                </p>
                <h2 className="mt-0.5 text-[19px] font-semibold">{steps[step].title}</h2>
                {steps[step].hint && (
                  <p className="mt-1 text-[12px] leading-relaxed text-faint">{steps[step].hint}</p>
                )}
              </div>
              <button onClick={onClose} className="-my-2 shrink-0 px-2 py-2 text-[13px] text-muted">
                Close
              </button>
            </div>

            <div className="space-y-4">{steps[step].body}</div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-miss/40 bg-miss-soft px-3 py-2 text-[13px] text-miss">
                {error}
              </p>
            )}

            <div className="mt-6 flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="rounded-full border border-line px-4 py-2.5 text-[13px] text-muted"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => (last ? void build() : setStep(step + 1))}
                className="ml-auto rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-ink"
              >
                {last ? "Build my plan" : "Next"}
              </button>
            </div>
          </>
        )}

        {(stage === "training" || stage === "meals") && (
          <Building stage={stage} onClose={onClose} />
        )}

        {stage === "done" && (
          <div className="py-6 text-center">
            <p className="text-[19px] font-semibold">You&rsquo;re set up.</p>
            <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-muted">
              Your week is written and the meals are planned
              {summary?.calorieTarget
                ? ` around ${summary.calorieTarget} kcal and ${summary.proteinTargetG}g protein a day`
                : ""}
              . Change anything by asking your coach.
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-ink"
            >
              Have a look
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Building({ stage, onClose }: { stage: "training" | "meals"; onClose: () => void }) {
  return (
    <div className="py-10 text-center">
      <button
        onClick={onClose}
        className="absolute right-5 top-4 -m-2 p-2 text-[13px] text-muted"
      >
        Close
      </button>
      <div className="flex justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2 animate-bounce rounded-full bg-accent"
            style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <p className="mt-4 text-[15px] font-medium">
        {stage === "training" ? "Writing your week…" : "Planning your meals…"}
      </p>
      <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-faint">
        {stage === "training"
          ? "Your coach is picking movements from the library that fit your days, your kit and anything you're working around."
          : "Seven days of meals inside your calorie and protein targets, around what you'll actually cook."}
      </p>
      {/* Closing does not cancel the work — say so, rather than leaving her to
          wonder whether she has just half-built a plan. */}
      <p className="mx-auto mt-3 max-w-xs text-[11px] leading-relaxed text-faint">
        You can close this — it carries on, and the plan will be there when it&rsquo;s done.
      </p>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-2 text-[12px] font-medium text-muted">{label}</p>
    {children}
  </div>
);

function Chips({
  options, value, onPick, multi,
}: { options: string[]; value: string[]; onPick: (v: string) => void; multi?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={multi ? on : undefined}
            onClick={() => onPick(o)}
            className={`rounded-full border px-3.5 py-2 text-[13px] ${
              on ? "border-accent bg-accent-soft text-accent" : "border-line bg-base text-muted"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
