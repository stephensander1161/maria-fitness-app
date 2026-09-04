"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NumberField } from "./number-field";
import { cmToIn, inToCm, kgToLb, lbToKg, type Units } from "@/lib/units";

/**
 * First run. Four screens, mostly taps, sensible defaults already selected —
 * she can get through it without typing anything but her name.
 *
 * A form rather than a conversation, deliberately: talking your way to a height
 * and a goal weight is slower than tapping it, and the coach's value is
 * everything that happens afterwards. It ends by building her a real week and a
 * real meal plan, so the app is never empty.
 */

const EQUIPMENT = [
  "dumbbells", "resistance bands", "bench", "kettlebell",
  "pull-up bar", "full gym", "bodyweight only",
] as const;

/** Her words, matched to lib/postpartum.ts symptoms in the onboard route. */
const PP_SYMPTOMS = [
  "leaking", "heaviness", "doming", "pain", "bleeding",
] as const;

const COMMON_LIMITS = ["knees", "lower back", "shoulders", "wrists", "neck", "hips"] as const;
const COMMON_DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "pescatarian", "halal", "kosher"] as const;

type Step = 0 | 1 | 2 | 3 | 4;

export function Onboarding({ defaultName }: { defaultName: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  // Recovery from childbirth. Asked rather than inferred, and only of people
  // it could apply to — see the step itself for why the questions are these.
  const [gaveBirth, setGaveBirth] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [delivery, setDelivery] = useState<"vaginal" | "caesarean" | "">("");
  const [ppCleared, setPpCleared] = useState<"yes" | "no" | "">("");
  const [breastfeeding, setBreastfeeding] = useState<"yes" | "no" | "">("");
  const [ppSymptoms, setPpSymptoms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(defaultName ?? "");
  const [age, setAge] = useState(32);
  const [sex, setSex] = useState<"female" | "male" | "other">("female");
  // Two settings, not one: the scale and the kitchen are chosen separately,
  // and the kitchen follows the scale until she says otherwise.
  const [units, setUnits] = useState<Units>("imperial");
  const [foodUnits, setFoodUnits] = useState<Units | null>(null);
  const [feet, setFeet] = useState(5);
  const [inches, setInches] = useState(6);
  const [heightCm, setHeightCm] = useState(168);
  const [currentWeight, setCurrentWeight] = useState(160);
  const [goalWeight, setGoalWeight] = useState(140);
  const wt = units === "imperial" ? "lb" : "kg";

  /** Flip the scale and carry the numbers across, so 160 lb becomes 72.5 kg, not 160 kg. */
  function switchUnits(next: Units) {
    if (next === units) return;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    if (next === "metric") {
      setHeightCm(Math.round(inToCm(feet * 12 + inches)));
      setCurrentWeight(r1(lbToKg(currentWeight)));
      setGoalWeight(r1(lbToKg(goalWeight)));
    } else {
      const totalIn = Math.round(cmToIn(heightCm));
      setFeet(Math.floor(totalIn / 12));
      setInches(totalIn % 12);
      setCurrentWeight(Math.round(kgToLb(currentWeight)));
      setGoalWeight(Math.round(kgToLb(goalWeight)));
    }
    setUnits(next);
  }
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [sessionMinutes, setSessionMinutes] = useState(45);
  const [equipment, setEquipment] = useState<string[]>(["dumbbells"]);
  const [experience, setExperience] = useState<"beginner" | "returning" | "intermediate" | "advanced">("returning");
  const [injuries, setInjuries] = useState<string[]>([]);
  const [diets, setDiets] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState("");
  const [motivation, setMotivation] = useState("");

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), age, sex,
          heightIn: units === "imperial" ? feet * 12 + inches : heightCm,
          currentWeight, goalWeight,
          daysPerWeek, sessionMinutes,
          equipment: equipment.length ? equipment : ["bodyweight only"],
          experience, injuries,
          dietaryRestrictions: diets,
          dislikedFoods: dislikes.split(",").map((d) => d.trim()).filter(Boolean),
          motivation: motivation.trim() || undefined,
          units, foodUnits,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(gaveBirth && birthDate
            ? {
                postpartum: {
                  birthDate,
                  delivery: delivery || undefined,
                  clearedForExercise: ppCleared === "yes",
                  breastfeeding: breastfeeding === "yes",
                  symptoms: ppSymptoms,
                },
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "That didn't save.");
      }
      // refresh() first: every server component must re-read the now-complete
      // profile, or the onboarding gate sends her straight back here.
      router.refresh();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (busy) return <Building />;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 py-10">
      <Progress step={step} />

      {step === 0 && (
        <Screen
          title="Let's start with you"
          sub="Thirty seconds, then I'll build your first week."
        >
          <Field label="What should I call you?">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-[16px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Age"><NumberField value={age} onChange={setAge} min={13} max={100} /></Field>
          <Field label="Sex">
            <Chips options={["female", "male", "other"]} value={[sex]}
              onPick={(v) => setSex(v as typeof sex)} />
          </Field>
        </Screen>
      )}

      {step === 1 && (
        <Screen title="Where you're at" sub="Rough is fine — you can correct it any time.">
          <Field label="Your scale reads in">
            <Chips options={["lb", "kg"]} value={[wt]}
              onPick={(v) => switchUnits(v === "lb" ? "imperial" : "metric")} />
          </Field>
          <Field label="Height">
            {units === "imperial" ? (
              <div className="grid grid-cols-2 gap-3">
                <NumberField value={feet} onChange={setFeet} min={3} max={7} suffix="ft" />
                <NumberField value={inches} onChange={setInches} min={0} max={11} suffix="in" />
              </div>
            ) : (
              <NumberField value={heightCm} onChange={setHeightCm} min={100} max={250} suffix="cm" />
            )}
          </Field>
          <Field label="Weight now">
            <NumberField value={currentWeight} onChange={setCurrentWeight}
              min={units === "imperial" ? 50 : 25} max={units === "imperial" ? 600 : 275} step={units === "imperial" ? 1 : 0.5} decimals={units === "metric"} suffix={wt} />
          </Field>
          <Field label="Where you'd like to be">
            <NumberField value={goalWeight} onChange={setGoalWeight}
              min={units === "imperial" ? 50 : 25} max={units === "imperial" ? 600 : 275} step={units === "imperial" ? 1 : 0.5} decimals={units === "metric"} suffix={wt} />
            {goalWeight < currentWeight && (
              // 0.5–1% of bodyweight a week is the pace that holds; the figure
              // is the same in either unit, and it is a rough guide, not a date.
              <p className="mt-2 text-center text-[12px] text-muted">
                {Math.round((currentWeight - goalWeight) * 10) / 10} {wt} to go — roughly{" "}
                {Math.ceil((currentWeight - goalWeight) / (currentWeight * 0.0075))} weeks at a steady, sustainable pace.
              </p>
            )}
          </Field>
          <Field label="Your kitchen measures in">
            <Chips options={["oz & cups", "grams & ml"]}
              value={[(foodUnits ?? units) === "imperial" ? "oz & cups" : "grams & ml"]}
              onPick={(v) => setFoodUnits(v === "oz & cups" ? "imperial" : "metric")} />
            <p className="mt-2 text-[12px] text-faint">
              Recipes, portions and oven temperatures are shown this way. The scale above is separate.
            </p>
          </Field>
        </Screen>
      )}

      {step === 2 && (
        <Screen title="How you'll train" sub="Be honest about the time you actually have.">
          <Field label="Days a week">
            <Chips options={["2", "3", "4", "5", "6"]} value={[String(daysPerWeek)]}
              onPick={(v) => setDaysPerWeek(Number(v))} />
          </Field>
          <Field label="Minutes a session">
            <Chips options={["30", "45", "60", "75"]} value={[String(sessionMinutes)]}
              onPick={(v) => setSessionMinutes(Number(v))} />
          </Field>
          <Field label="What you've got">
            <Chips options={[...EQUIPMENT]} value={equipment} multi
              onPick={(v) => toggle(equipment, setEquipment, v)} />
          </Field>
          <Field label="Lifting experience">
            <Chips
              options={["beginner", "returning", "intermediate", "advanced"]}
              value={[experience]}
              onPick={(v) => setExperience(v as typeof experience)}
            />
          </Field>
        </Screen>
      )}

      {step === 3 && (
        /*
         * Asked, never inferred. The app cannot see this and guessing from age
         * and sex would be both wrong and insulting — but not asking is worse,
         * because the answer changes which movements are safe. Everything here
         * is optional and the whole step collapses to one tap for anyone it
         * does not apply to.
         *
         * "Sex" is the closest thing on file, and it is not the same question,
         * so the step is offered to everyone who has not said male rather than
         * being gated on a guess.
         */
        <Screen title="Recovery" sub="So the plan is right for where your body actually is. Skip if it doesn't apply.">
          <Field label="Have you given birth in the last two years?">
            <Chips options={["no", "yes"]} value={[gaveBirth ? "yes" : "no"]}
              onPick={(v) => setGaveBirth(v === "yes")} />
          </Field>

          {gaveBirth && (
            <>
              <Field label="Roughly when?">
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  aria-label="Date you gave birth"
                  className="w-full rounded-xl border border-edge bg-surface px-4 py-3 text-[15px] focus:border-accent focus:outline-none"
                />
              </Field>
              <Field label="How was the birth?">
                <Chips options={["vaginal", "caesarean"]} value={delivery ? [delivery] : []}
                  onPick={(v) => setDelivery(v as "vaginal" | "caesarean")} />
              </Field>
              <Field label="Has a doctor, midwife or physio cleared you for exercise?">
                {/* The gate. Until this is yes, the app will not write a
                    programme — it says walk and breathe, and says why. */}
                <Chips options={["not yet", "yes"]} value={ppCleared === "yes" ? ["yes"] : ppCleared === "no" ? ["not yet"] : []}
                  onPick={(v) => setPpCleared(v === "yes" ? "yes" : "no")} />
              </Field>
              <Field label="Are you breastfeeding?">
                {/* Roughly 450-500 kcal a day. Left out, the app would hand
                    her a far bigger deficit than it thinks it is. */}
                <Chips options={["no", "yes"]} value={breastfeeding ? [breastfeeding] : []}
                  onPick={(v) => setBreastfeeding(v as "yes" | "no")} />
              </Field>
              <Field label="Any of these? Nothing here is unusual, and each one changes what's safe.">
                <Chips options={[...PP_SYMPTOMS]} value={ppSymptoms} multi
                  onPick={(v) => toggle(ppSymptoms, setPpSymptoms, v)} />
              </Field>
              <p className="text-[12px] leading-relaxed text-muted">
                This app is not a substitute for a pelvic health physiotherapist. If you have
                any of the above, it will tell you to get assessed rather than train around it.
              </p>
            </>
          )}
        </Screen>
      )}

      {step === 4 && (
        <Screen title="Anything I should work around?" sub="All optional — skip it if nothing applies.">
          <Field label="Joints or areas that complain">
            <Chips options={[...COMMON_LIMITS]} value={injuries} multi
              onPick={(v) => toggle(injuries, setInjuries, v)} />
          </Field>
          <Field label="How you eat">
            <Chips options={[...COMMON_DIETS]} value={diets} multi
              onPick={(v) => toggle(diets, setDiets, v)} />
          </Field>
          <Field label="Foods you won't eat">
            <input
              value={dislikes}
              onChange={(e) => setDislikes(e.target.value)}
              placeholder="mushrooms, olives…"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-[16px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Why this matters to you">
            <textarea
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              rows={2}
              placeholder="Optional — but I'll remember it."
              className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-[16px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </Field>
        </Screen>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-miss/40 bg-miss-soft px-4 py-3 text-center text-[13px] text-miss">
          {error}
        </p>
      )}

      <div className="mt-auto flex gap-3 pt-8">
        {step > 0 && (
          <button onClick={() => setStep((s) => (s - 1) as Step)}
            className="rounded-xl border border-line px-5 py-3.5 text-[15px] text-muted">
            Back
          </button>
        )}
        <button
          onClick={() => (step === 4 ? finish() : setStep((s) => (s + 1) as Step))}
          disabled={step === 0 && !name.trim()}
          className="flex-1 rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-40"
        >
          {step === 4 ? "Build my plan" : "Next"}
        </button>
      </div>
    </div>
  );
}

function Building() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="relative mb-8 size-16">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
        <span className="absolute inset-2 rounded-full bg-accent" />
      </div>
      <p className="text-[19px] font-semibold">Building your first week</p>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted">
        Picking movements that fit your equipment, working around anything sore,
        and putting a week of meals together. Fifteen seconds or so.
      </p>
    </div>
  );
}

const Progress = ({ step }: { step: number }) => (
  <div className="mb-8 flex gap-1.5">
    {[0, 1, 2, 3, 4].map((i) => (
      <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-accent" : "bg-raised"}`} />
    ))}
  </div>
);

const Screen = ({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) => (
  <div>
    <h1 className="text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
    <p className="mb-7 mt-1.5 text-[14px] text-muted">{sub}</p>
    <div className="space-y-6">{children}</div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">{label}</p>
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
          <button key={o} onClick={() => onPick(o)}
            aria-pressed={on}
            className={`rounded-full border px-4 py-2.5 text-[14px] capitalize transition-colors ${
              on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
            }`}>
            {o}
          </button>
        );
      })}
      {multi && <span className="sr-only">Choose as many as apply</span>}
    </div>
  );
}

