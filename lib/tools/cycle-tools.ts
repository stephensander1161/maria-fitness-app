import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { cycleEvents, weighIns } from "@/lib/db/schema";
import { todayForProfile } from "@/lib/profile";
import { cyclePhase, nextExpected, weightCaveat, type Period } from "@/lib/cycle";
import { weightTrend } from "@/lib/trend";
import { defineTool } from "./define";

/**
 * Her cycle, kept for two reasons and no others: so a fluid rise on the scale
 * is explained rather than counted as a gain, and so she can decide to move a
 * session when she feels rough. It does not prescribe training by phase — that
 * is ahead of the evidence, and telling a beginner she is fragile on a
 * schedule costs more than it gives.
 */
async function periodsFor(profileId: string): Promise<Period[]> {
  const rows = await db.select().from(cycleEvents)
    .where(eq(cycleEvents.profileId, profileId))
    .orderBy(cycleEvents.date);

  const periods: Period[] = [];
  for (const row of rows) {
    if (row.kind === "period_start") periods.push({ start: row.date, end: null });
    else if (row.kind === "period_end" && periods.length) {
      const open = periods[periods.length - 1];
      if (open.end === null) open.end = row.date;
    }
  }
  return periods;
}

export const logCycleEvent = defineTool({
  name: "log_cycle_event",
  description:
    "Records the start or end of her period, or how she is feeling — cramps, exhaustion, poor sleep. Kept for two things: explaining a rise on the scale that is water rather than fat, and letting her move a session when she feels rough. It is not used to prescribe training, and you should not offer to: the evidence does not support programming by cycle phase.",
  input: z.object({
    kind: z.enum(["period_start", "period_end", "symptom"]),
    date: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
    symptoms: z.array(z.string()).optional().describe("Her words: 'cramps', 'wiped out'"),
    note: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    const [row] = await db.insert(cycleEvents).values({
      profileId: ctx.profileId, date, kind: input.kind,
      symptoms: input.symptoms ?? [], note: input.note ?? null,
    }).returning();

    const periods = await periodsFor(ctx.profileId);
    const phase = cyclePhase(periods, date);
    return {
      ok: true, id: row.id, kind: row.kind, date,
      dayOfCycle: phase.dayOfCycle,
      typicalLength: phase.typicalLength,
      hint: input.kind === "symptom"
        ? "Ask whether she wants to move or lighten today's session. Her call, not yours."
        : undefined,
    };
  },
});

export const getCycleStatus = defineTool({
  name: "get_cycle_status",
  description:
    "Where she is in her cycle, what her own typical length is, and whether the scale needs explaining this week. Check it before saying anything about a weight change: a rise in the week before a period is fluid, and reporting it as a gain is the most common way an app like this tells a woman she has failed at something she has not. Returns nothing useful until she has logged two cycles, and says so rather than assuming 28 days.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const asOf = await todayForProfile(ctx.profileId);
    const periods = await periodsFor(ctx.profileId);
    if (periods.length === 0) {
      return { tracking: false, hint: "Nothing logged. Do not raise it unless she does." };
    }

    const phase = cyclePhase(periods, asOf);
    const recent = await db.select({ date: weighIns.date, weightKg: weighIns.weightKg })
      .from(weighIns).where(eq(weighIns.profileId, ctx.profileId))
      .orderBy(desc(weighIns.date)).limit(60);
    const trend = weightTrend(recent, asOf);

    const symptoms = await db.select().from(cycleEvents)
      .where(and(eq(cycleEvents.profileId, ctx.profileId), eq(cycleEvents.kind, "symptom")))
      .orderBy(desc(cycleEvents.date)).limit(5);

    return {
      tracking: true,
      dayOfCycle: phase.dayOfCycle,
      typicalLength: phase.typicalLength,
      bleeding: phase.bleeding,
      premenstrual: phase.premenstrual,
      nextExpected: nextExpected(periods, asOf),
      recentSymptoms: symptoms.map((s) => ({ date: s.date, symptoms: s.symptoms, note: s.note })),
      weightCaveat: weightCaveat(phase, trend.weeklyChangeKg),
      cyclesLogged: periods.length,
      hint: phase.typicalLength === null
        ? "One cycle logged — not enough to predict anything. Do not assume 28 days."
        : undefined,
    };
  },
});

/** The line the coach gets in its state block, when there is one worth having. */
export async function cycleSignal(profileId: string, asOf: string): Promise<string | null> {
  const periods = await periodsFor(profileId);
  if (periods.length === 0) return null;

  const phase = cyclePhase(periods, asOf);
  const recent = await db.select({ date: weighIns.date, weightKg: weighIns.weightKg })
    .from(weighIns).where(eq(weighIns.profileId, profileId))
    .orderBy(desc(weighIns.date)).limit(60);
  return weightCaveat(phase, weightTrend(recent, asOf).weeklyChangeKg);
}
