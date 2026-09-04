import type { ISODate } from "@/lib/date";

/**
 * Coming back from childbirth.
 *
 * This is the one part of the app where getting it wrong does lasting damage
 * rather than wasting a week. Loading a pelvic floor that is not ready, or
 * crunching an abdominal wall that is still remodelling, can leave someone
 * leaking or with a prolapse for years. So this module is deliberately
 * conservative, and every rule here answers to the same three ideas:
 *
 *  1. **Clearance is a gate, not a formality.** Before a clinician has checked
 *     her, this app does not prescribe a programme. It says walk and breathe.
 *  2. **Symptoms stop the progression.** Leaking, heaviness, doming, pain or
 *     bleeding that had stopped are not things to push through — they are the
 *     signal to see a pelvic health physiotherapist. First-line treatment for
 *     postnatal leaking is supervised pelvic floor training, and it works.
 *  3. **Time is not the only variable, but it is one.** Connective tissue
 *     remodels for six to twelve months. The six-week check is a check, not a
 *     finish line.
 *
 * None of this is a substitute for a clinician, and the app says so out loud
 * rather than burying it. Everything here is pure so it can be tested, because
 * a safety rail nobody exercises is a comment.
 */

export type Delivery = "vaginal" | "caesarean";

/** What she is actually experiencing. Each one changes what is safe. */
export type PostpartumSymptom =
  | "leaking"     // urine or wind on effort, coughing, jumping
  | "heaviness"   // dragging or bulging — the prolapse symptom
  | "doming"      // the midline tenting under load
  | "pain"        // pelvic, back, or scar
  | "bleeding";   // bright red, returning after it had stopped

export type PostpartumStatus = {
  /** Null means she is not telling the app she is postpartum. */
  birthDate: ISODate | null;
  delivery: Delivery | null;
  /** The date a clinician cleared her for exercise. Null means not yet. */
  clearedAt: ISODate | null;
  breastfeeding: boolean;
  symptoms: PostpartumSymptom[];
};

export type Stage =
  /** Before clearance. Walking, breathing, and gentle pelvic floor work. */
  | "early"
  /** Cleared, rebuilding the foundation: breathing, pelvic floor, low load. */
  | "foundation"
  /** Cleared and past the early window: progressive loading. */
  | "building";

export const SYMPTOM_LABELS: Record<PostpartumSymptom, string> = {
  leaking: "Leaking when you cough, jump or lift",
  heaviness: "Heaviness, dragging or bulging down below",
  doming: "Your tummy domes or tents in the middle",
  pain: "Pain — pelvic, back, or around a scar",
  bleeding: "Bleeding that had stopped and came back",
};

/**
 * What each symptom means and what to do. Written to be said to her almost
 * verbatim: none of these are "listen to your body", which is what an app says
 * when it does not want to commit to advice.
 */
export const SYMPTOM_GUIDANCE: Record<PostpartumSymptom, string> = {
  leaking:
    "Common, and not something to live with or train around quietly. Supervised pelvic floor muscle training is the first-line treatment and it works. Stop the movement that causes it and see a pelvic health physiotherapist — this is a fixable thing.",
  heaviness:
    "A dragging or bulging feeling can be a sign of prolapse, and loading through it can make it worse. Stop impact and heavy lifting and get assessed by a pelvic health physiotherapist before going further.",
  doming:
    "The midline is tenting rather than holding tension. It is a sign the load is currently more than the connective tissue can manage, not a sign of damage — reduce the load or change the movement until it stays flat.",
  pain:
    "Pain is a stop signal, not something to work through. Pelvic or scar pain in particular needs assessing rather than pushing past.",
  bleeding:
    "Bleeding that had settled and came back usually means you have done more than your body is ready for. Step back to walking and contact your midwife or doctor.",
};

/** The weeks a clinician usually waits before the check. */
const CHECK_WEEKS: Record<Delivery, number> = { vaginal: 6, caesarean: 8 };
/** Past this, the foundation work has usually done its job. */
const FOUNDATION_WEEKS = 12;
/** Impact needs both time and no symptoms; this is the time half. */
const IMPACT_WEEKS = 12;

export const isPostpartum = (s: PostpartumStatus): boolean => s.birthDate !== null;

export function weeksSinceBirth(birthDate: ISODate, asOf: ISODate): number {
  const ms = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${birthDate}T00:00:00Z`);
  return Math.max(0, Math.floor(ms / (7 * 86_400_000)));
}

/**
 * Where she is, which decides everything else.
 *
 * Clearance gates the whole thing: without it she stays in `early` however
 * many weeks have passed, because the check is what rules out the things a
 * training app cannot see. Time alone does not promote her.
 */
export function stageFor(s: PostpartumStatus, asOf: ISODate): Stage | null {
  if (!s.birthDate) return null;
  if (!s.clearedAt) return "early";
  const weeks = weeksSinceBirth(s.birthDate, asOf);
  return weeks < FOUNDATION_WEEKS ? "foundation" : "building";
}

/** Symptoms that mean stop and get assessed, rather than adjust and carry on. */
export const redFlags = (s: PostpartumStatus): PostpartumSymptom[] =>
  s.symptoms.filter((x) => x === "heaviness" || x === "bleeding" || x === "pain" || x === "leaking");

/**
 * Running, jumping, and anything else that lands.
 *
 * Three conditions, all required: cleared, far enough out, and no symptoms.
 * Returning to impact while leaking is how a manageable problem becomes a
 * lasting one, and "she really wants to run" is not a fourth condition.
 */
export function impactReady(
  s: PostpartumStatus,
  asOf: ISODate,
): { ready: boolean; because: string } {
  if (!s.birthDate) return { ready: true, because: "" };
  if (!s.clearedAt) {
    return { ready: false, because: "You have not been cleared yet. Walking is the impact for now." };
  }
  const weeks = weeksSinceBirth(s.birthDate, asOf);
  if (weeks < IMPACT_WEEKS) {
    return {
      ready: false,
      because: `You are ${weeks} week${weeks === 1 ? "" : "s"} in. Returning to running before about ${IMPACT_WEEKS} weeks carries a higher rate of pelvic floor problems, so the foundation work comes first.`,
    };
  }
  const flags = redFlags(s);
  if (flags.length > 0) {
    return {
      ready: false,
      because: "Impact waits until the symptoms you have reported have settled — see a pelvic health physiotherapist first. Loading through them is what turns a fixable problem into a long one.",
    };
  }
  return { ready: true, because: "Cleared, far enough out, and no symptoms. Build back gradually — walk, then intervals, then continuous." };
}

/** Movements that are wrong for where she is, and the reason in her words. */
export function avoidAt(stage: Stage, s: PostpartumStatus): { what: string; why: string }[] {
  const always = [
    {
      what: "Sit-ups, crunches and full planks",
      why: s.symptoms.includes("doming")
        // She has already seen it happen, so say what she saw rather than
        // warning her about a possibility she has met.
        ? "These are the movements most likely to produce the doming you have noticed — they load the midline in exactly the direction it is still remodelling."
        : "They load the midline in exactly the direction it is still remodelling, and they are the movements most likely to make it dome.",
    },
    {
      what: "Holding your breath to brace",
      why: "That pushes down onto a pelvic floor that is already doing more than usual. Breathe out on the effort instead.",
    },
  ];
  if (stage === "early") {
    return [
      ...always,
      { what: "Structured training of any kind", why: "Until a clinician has checked you, this app will not write you a programme. Walking and breathing are the work." },
      {
        what: "Lifting anything heavier than your baby",
        why: s.delivery === "caesarean"
          ? "There is a healing incision through your abdominal wall — that is major abdominal surgery, and it is still knitting."
          : "Your abdominal wall and pelvic floor are both carrying more than usual while the connective tissue remodels.",
      },
      { what: "Running, jumping and skipping", why: "The pelvic floor is carrying the load these create, and it has not been assessed yet." },
    ];
  }
  if (stage === "foundation") {
    return [
      ...always,
      { what: "Running, jumping and skipping", why: "Impact usually waits until about twelve weeks and no symptoms, whichever comes later." },
      { what: "Heavy or near-maximal lifting", why: "Load builds from what you can control. Strength comes back faster than connective tissue does." },
    ];
  }
  return [
    ...always,
    { what: "Adding load and impact in the same week", why: "When something flares you want to know which one did it." },
  ];
}

/**
 * The energy cost of feeding, which the app must not treat as a rounding error.
 *
 * Breastfeeding costs roughly 450-500 kcal a day. An app that hands a feeding
 * mother the same deficit as anyone else is prescribing a much bigger one than
 * it thinks, and supply is the thing that suffers.
 */
export const LACTATION_KCAL = 450;
/** No feeding mother gets a target under this, whatever the arithmetic says. */
export const LACTATION_CALORIE_FLOOR = 1800;

export function energyNote(s: PostpartumStatus): string | null {
  if (!s.breastfeeding) return null;
  return `Feeding costs roughly ${LACTATION_KCAL} kcal a day, so that is added to what you burn before any deficit is worked out, and the target never goes below ${LACTATION_CALORIE_FLOOR}. Cutting hard while feeding is how supply drops.`;
}

/** One sentence for the top of the screen and for the coach's state block. */
export function summarise(s: PostpartumStatus, asOf: ISODate): string {
  if (!s.birthDate) return "";
  const weeks = weeksSinceBirth(s.birthDate, asOf);
  const stage = stageFor(s, asOf);
  const bits = [`${weeks} week${weeks === 1 ? "" : "s"} postpartum`];
  if (s.delivery) bits.push(s.delivery === "caesarean" ? "caesarean birth" : "vaginal birth");
  bits.push(s.clearedAt ? "cleared for exercise" : "NOT yet cleared for exercise");
  if (s.breastfeeding) bits.push("breastfeeding");
  const flags = redFlags(s);
  if (flags.length > 0) bits.push(`reporting ${flags.map((f) => SYMPTOM_LABELS[f].toLowerCase()).join("; ")}`);
  return `Postpartum: ${bits.join(", ")}. Stage: ${stage}.`;
}

/** Whether she is far enough along that the check should already have happened. */
export function checkOverdue(s: PostpartumStatus, asOf: ISODate): boolean {
  if (!s.birthDate || s.clearedAt) return false;
  return weeksSinceBirth(s.birthDate, asOf) >= CHECK_WEEKS[s.delivery ?? "vaginal"];
}

/**
 * The block the coach is given, and the one place this must be unmissable.
 *
 * CLAUDE.md is emphatic that the model believes this block completely, which
 * is exactly why the instruction lives here rather than only in the persona:
 * prescribing crunches to someone three weeks after a caesarean is the harm
 * case, and it has to be impossible to read past.
 */
export function postpartumSignal(s: PostpartumStatus, asOf: ISODate): string {
  if (!s.birthDate) return "";
  const stage = stageFor(s, asOf);
  const lines = [`IMPORTANT: ${summarise(s, asOf)}`];

  if (stage === "early") {
    lines.push(
      "She has NOT been cleared for exercise. Do not write or adjust a training programme, do not prescribe loaded movements, and do not agree to build a week even if she asks. Walking, breathing and gentle pelvic floor work only — and say that these count as training rather than apologising for them.",
    );
    if (checkOverdue(s, asOf)) {
      lines.push("She is past the usual point for the postnatal check. Encourage her to book it, warmly and once.");
    }
  } else {
    lines.push(
      stage === "foundation"
        ? "Cleared and rebuilding. Breathing, pelvic floor, deep abdominal wall, then bodyweight strength. No impact yet."
        : "Cleared and building. Load progressively and keep the pelvic floor work in the plan rather than dropping it.",
    );
  }

  const flags = redFlags(s);
  if (flags.length > 0) {
    lines.push(
      `She has reported ${flags.join(", ")}. Never tell her to push through these. Say plainly that they need assessing by a pelvic health physiotherapist, that supervised pelvic floor training is the first-line treatment and it works, and that this is fixable rather than permanent. Do not prescribe impact or heavy loading while they are present.`,
    );
  }
  const impact = impactReady(s, asOf);
  if (!impact.ready) lines.push(`Running and jumping are not appropriate yet: ${impact.because}`);

  lines.push(
    "Never prescribe sit-ups, crunches or full planks, and never coach her to hold her breath to brace. You are not a substitute for a pelvic health physiotherapist and should say so when it matters.",
  );
  const energy = energyNote(s);
  if (energy) lines.push(energy);
  return lines.join(" ");
}
