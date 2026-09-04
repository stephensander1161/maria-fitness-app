import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { defineTool } from "./define";
import { todayForProfile } from "@/lib/profile";
import {
  avoidAt, checkOverdue, energyNote, impactReady, redFlags, stageFor, summarise,
  SYMPTOM_GUIDANCE, SYMPTOM_LABELS, type PostpartumStatus, type PostpartumSymptom,
} from "@/lib/postpartum";

/**
 * Coming back from childbirth, as something she can ask about.
 *
 * The guidance itself lives in lib/postpartum.ts, pure and tested, because
 * this is the part of the app where wrong advice costs years. These tools read
 * it out and record what she tells them; they do not decide anything
 * themselves.
 */

const SYMPTOMS = ["leaking", "heaviness", "doming", "pain", "bleeding"] as const;

async function statusOf(profileId: string): Promise<PostpartumStatus> {
  const [p] = await db.select({
    birthDate: profiles.postpartumBirthDate,
    delivery: profiles.postpartumDelivery,
    clearedAt: profiles.postpartumClearedAt,
    breastfeeding: profiles.breastfeeding,
    symptoms: profiles.postpartumSymptoms,
  }).from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!p) throw new Error(`No profile ${profileId}`);
  return {
    birthDate: p.birthDate,
    delivery: p.delivery,
    clearedAt: p.clearedAt,
    breastfeeding: p.breastfeeding,
    symptoms: (p.symptoms ?? []) as PostpartumSymptom[],
  };
}

export const setPostpartumStatus = defineTool({
  name: "set_postpartum_status",
  description:
    "Records where she is in recovery from childbirth — when she gave birth, whether it was a caesarean, whether a clinician has cleared her for exercise, whether she is breastfeeding, and any symptoms like leaking or heaviness. This is what makes the app choose safe movements and stop suggesting the ones that are wrong right now, so save it as soon as she mentions any of it. Everything is optional; what she does not mention keeps its current value. Set gaveBirth to false to clear it all if she says it no longer applies.",
  input: z.object({
    gaveBirth: z.boolean().optional().describe("False clears her postpartum status entirely"),
    birthDate: z.string().optional().describe("YYYY-MM-DD, the day she gave birth"),
    delivery: z.enum(["vaginal", "caesarean"]).optional(),
    clearedForExercise: z.boolean().optional()
      .describe("Has a doctor, midwife or physio checked her and said she can exercise"),
    clearedOn: z.string().optional().describe("YYYY-MM-DD of that check, if she says"),
    breastfeeding: z.boolean().optional(),
    symptoms: z.array(z.enum(SYMPTOMS)).optional()
      .describe("Replaces the current list. Empty array means she has none."),
  }),
  handler: async (input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const current = await statusOf(ctx.profileId);

    if (input.gaveBirth === false) {
      await db.update(profiles).set({
        postpartumBirthDate: null, postpartumDelivery: null, postpartumClearedAt: null,
        breastfeeding: false, postpartumSymptoms: [],
      }).where(eq(profiles.id, ctx.profileId));
      return { ok: true, cleared: true };
    }

    const patch: Record<string, unknown> = {};
    if (input.birthDate !== undefined) patch.postpartumBirthDate = input.birthDate;
    if (input.delivery !== undefined) patch.postpartumDelivery = input.delivery;
    if (input.breastfeeding !== undefined) patch.breastfeeding = input.breastfeeding;
    if (input.symptoms !== undefined) patch.postpartumSymptoms = input.symptoms;
    if (input.clearedForExercise !== undefined) {
      // Clearance is a gate, so it is stored as the date it happened rather
      // than a flag — "when were you checked" is answerable, "true" is not.
      patch.postpartumClearedAt = input.clearedForExercise ? (input.clearedOn ?? today) : null;
    } else if (input.clearedOn !== undefined) {
      patch.postpartumClearedAt = input.clearedOn;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(profiles).set(patch).where(eq(profiles.id, ctx.profileId));
    }

    const after = await statusOf(ctx.profileId);
    const stage = stageFor(after, today);
    return {
      ok: true,
      stage,
      summary: summarise(after, today),
      // Said back immediately, because the most useful moment to hear it is
      // the moment she says it.
      guidance: after.symptoms.map((sx) => SYMPTOM_GUIDANCE[sx]),
      wasCleared: Boolean(current.clearedAt),
    };
  },
});

export const getPostpartumPlan = defineTool({
  name: "get_postpartum_plan",
  description:
    "Reads back where she is in recovery from childbirth and what that means right now — which stage she is in, what to work on, what to leave alone for the moment, whether running is sensible yet, and what any symptoms she has reported mean. Use it before prescribing anything to someone who has told the app she is postpartum, and whenever she asks what she should be doing.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const s = await statusOf(ctx.profileId);
    const stage = stageFor(s, today);
    if (!stage) {
      return { postpartum: false, note: "She has not told the app she is postpartum. Do not assume it." };
    }

    const impact = impactReady(s, today);
    return {
      postpartum: true,
      stage,
      summary: summarise(s, today),
      cleared: Boolean(s.clearedAt),
      checkOverdue: checkOverdue(s, today),
      focus: FOCUS[stage],
      avoid: avoidAt(stage, s),
      impact,
      symptoms: s.symptoms.map((sx) => ({ symptom: sx, means: SYMPTOM_LABELS[sx], do: SYMPTOM_GUIDANCE[sx] })),
      seePhysio: redFlags(s).length > 0,
      energy: energyNote(s),
      // The sentence that has to survive every rewrite.
      nonNegotiable:
        "This app is not a substitute for a pelvic health physiotherapist. Leaking, heaviness, doming, pain, or bleeding that had stopped mean stop and get assessed — never push through them.",
    };
  },
});

/**
 * What the work actually is at each stage, in movements the library already
 * holds.
 *
 * Every slug here is an existing entry with its own cues, mistakes and safety
 * note — the library had a postpartum section before this feature did, and
 * seeding parallel copies under new names would have split it in two. If a
 * stage needs a movement that does not exist, add it to lib/seed/exercises.ts
 * rather than inventing a slug here; tests/exercises.test.ts checks that every
 * reference resolves.
 */
const FOCUS: Record<"early" | "foundation" | "building", { work: string; movements: string[] }> = {
  early: {
    work: "Walking, breathing, and gentle pelvic floor work — including learning to let go, which is half of it. That is genuine training right now, not a consolation prize: after late pregnancy and birth a walk sits at a real percentage of your capacity, which is the definition of a training stimulus.",
    movements: [
      "diaphragmatic-breathing", "postpartum-connection-breath",
      "pelvic-floor-activation", "pelvic-floor-relaxation", "brisk-walk",
    ],
  },
  foundation: {
    work: "Rebuilding the connection before the load: breathing into the ribs, pelvic floor both ways, the deep abdominal wall, then movement added a limb at a time while the midline stays flat.",
    movements: [
      "postpartum-connection-breath", "pelvic-floor-activation", "pelvic-floor-relaxation",
      "tva-activation", "core-heel-slide", "supine-march", "standing-pelvic-tilt",
      "glute-bridge", "wall-plank",
    ],
  },
  building: {
    work: "Progressive loading, with the pelvic floor work kept in rather than dropped. Carrying is worth training on purpose — a baby goes from about 3.5kg to 10kg in a year and you carry them the whole way, which is textbook progressive overload you cannot skip.",
    movements: [
      "pelvic-floor-activation", "tva-activation", "dead-bug", "bird-dog",
      "glute-bridge", "single-leg-glute-bridge", "incline-plank",
      "suitcase-carry", "goblet-squat",
    ],
  },
};
