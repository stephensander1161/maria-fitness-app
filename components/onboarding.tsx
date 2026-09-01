"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NumberField } from "./number-field";

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

const COMMON_LIMITS = ["knees", "lower back", "shoulders", "wrists", "neck", "hips"] as const;
const COMMON_DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "pescatarian", "halal", "kosher"] as const;

type Step = 0 | 1 | 2 | 3;

export function Onboarding({ defaultName }: { defaultName: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(defaultName ?? "");
  const [age, setAge] = useState(32);
  const [sex, setSex] = useState<"female" | "male" | "other">("female");
  const [feet, setFeet] = useState(5);
  const [inches, setInches] = useState(6);
  const [currentWeight, setCurrentWeight] = useState(160);
  const [goalWeight, setGoalWeight] = useState(140);
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
          heightIn: feet * 12 + inches,
          currentWeight, goalWeight,
          daysPerWeek, sessionMinutes,
          equipment: equipment.length ? equipment : ["bodyweight only"],
          experience, injuries,
          dietaryRestrictions: diets,
          dislikedFoods: dislikes.split(",").map((d) => d.trim()).filter(Boolean),
          motivation: motivation.trim() || undefined,
          units: "imperial",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
          <Field label="Height">
            <div className="grid grid-cols-2 gap-3">
              <NumberField value={feet} onChange={setFeet} min={3} max={7} suffix="ft" />
              <NumberField value={inches} onChange={setInches} min={0} max={11} suffix="in" />
            </div>
          </Field>
          <Field label="Weight now">
            <NumberField value={currentWeight} onChange={setCurrentWeight} min={50} max={600} suffix="lb" />
          </Field>
          <Field label="Where you'd like to be">
            <NumberField value={goalWeight} onChange={setGoalWeight} min={50} max={600} suffix="lb" />
            {goalWeight < currentWeight && (
              <p className="mt-2 text-center text-[12px] text-muted">
                {currentWeight - goalWeight} lb — about{" "}
                {Math.ceil((currentWeight - goalWeight) / (currentWeight * 0.0075))} weeks at a pace you can hold.
              </p>
            )}
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
        <p className="mt-4 rounded-xl border border-miss/40 bg-miss-soft px-4 py-3 text-center text-[13px] text-miss">
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
          onClick={() => (step === 3 ? finish() : setStep((s) => (s + 1) as Step))}
          disabled={step === 0 && !name.trim()}
          className="flex-1 rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-ink disabled:opacity-40"
        >
          {step === 3 ? "Build my plan" : "Next"}
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
    {[0, 1, 2, 3].map((i) => (
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

