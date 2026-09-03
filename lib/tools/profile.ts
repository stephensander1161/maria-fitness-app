import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { goals, profiles, weighIns } from "@/lib/db/schema";
import { FUTURE_DATE_ERROR, isFuture } from "@/lib/date";
import { heightLabel, inToCm, weightIn, weightLabel, weightOut } from "@/lib/units";
import { missingForPlan, profileToday, todayForProfile, ageFrom } from "@/lib/profile";
import { weightTrend } from "@/lib/trend";
import { foodUnitsOf } from "@/lib/food-units";
import { MAX_REST_SECONDS, MIN_REST_SECONDS, REST_GROUPS } from "@/lib/rest";
import { defineTool, type ToolContext } from "./define";

/** Numbers crossing the tool boundary are always in HER units (lb/in by
 *  default). Handlers convert to canonical metric on the way in and back on
 *  the way out, so the model never does unit arithmetic. */
async function profileOf(ctx: ToolContext) {
  const [p] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
  if (!p) throw new Error("Profile not found");
  return p;
}

export const getProfile = defineTool({
  name: "get_profile",
  description:
    "Read her full profile: age, height, current and goal weight, equipment, injuries, dietary restrictions, schedule, and whether onboarding is complete. Call this at the start of any conversation where you need context about her.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const p = await profileOf(ctx);
    const [latest] = await db
      .select()
      .from(weighIns)
      .where(eq(weighIns.profileId, ctx.profileId))
      .orderBy(desc(weighIns.date))
      .limit(1);
    const u = p.units;
    return {
      name: p.name,
      age: ageFrom(p.birthYear, await todayForProfile(ctx.profileId)),
      sex: p.sex,
      height: heightLabel(p.heightCm, u),
      // Body and kitchen are separate preferences. `units` is the scale and
      // tape; `foodUnits` is portions, ingredients and oven temperatures.
      units: u,
      weightUnit: weightLabel(u),
      foodUnits: foodUnitsOf(p),
      foodUnitsFollowBody: p.foodUnits === null,
      startWeight: weightOut(p.startWeightKg, u),
      currentWeight: weightOut(latest?.weightKg ?? p.startWeightKg, u),
      goalWeight: weightOut(p.goalWeightKg, u),
      goalDate: p.goalDate,
      motivation: p.motivation,
      activityLevel: p.activityLevel,
      experience: p.experience,
      daysPerWeek: p.daysPerWeek,
      sessionMinutes: p.sessionMinutes,
      equipment: p.equipment,
      injuries: p.injuries,
      dietaryRestrictions: p.dietaryRestrictions,
      dislikedFoods: p.dislikedFoods,
      cookingSkill: p.cookingSkill,
      onboarded: p.onboardedAt !== null,
      missingForPlan: missingForPlan(p),
    };
  },
});

export const updateProfile = defineTool({
  name: "update_profile",
  description:
    "Create or update her profile. Call this during onboarding as she answers, and any time she mentions a change (new gym, new injury, going vegetarian, wants grams in the kitchen). Only pass the fields you learned — omitted fields are left alone. Weights are in her display units (lb by default); height in inches, or centimetres if she uses metric. `units` is her body — scale and tape; `foodUnits` is her kitchen — portions, ingredients and oven temperatures — and follows `units` unless set.",
  input: z.object({
    name: z.string().optional(),
    age: z.number().optional().describe("Age in years; stored as birth year"),
    sex: z.enum(["female", "male", "other"]).optional(),
    height: z.number().optional().describe("Inches if imperial, centimetres if metric"),
    currentWeight: z.number().optional().describe("Also recorded as today's weigh-in"),
    goalWeight: z.number().optional(),
    goalDate: z.string().nullable().optional()
      .describe("YYYY-MM-DD target date for the goal weight. Pass null to drop the deadline."),
    startWeight: z.number().optional()
      .describe("What she actually started at, if the number on file is wrong. Separate from currentWeight, which logs a weigh-in for today."),
    timezone: z.string().optional()
      .describe("IANA zone, e.g. 'America/Vancouver'. Set it when she says she has moved — every date in the app is computed in it."),
    motivation: z.string().optional().describe("Why this matters to her, in her own words"),
    activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
    experience: z.enum(["beginner", "returning", "intermediate", "advanced"]).optional(),
    daysPerWeek: z.number().optional(),
    sessionMinutes: z.number().optional(),
    equipment: z.array(z.string()).optional()
      .describe("e.g. ['full gym'] or ['dumbbells','resistance bands','bodyweight']"),
    injuries: z.array(z.string()).optional(),
    dietaryRestrictions: z.array(z.string()).optional(),
    dislikedFoods: z.array(z.string()).optional(),
    cookingSkill: z.enum(["minimal", "comfortable", "keen"]).optional(),
    coachTone: z.enum(["encouraging", "plain", "hype"]).optional()
      .describe("How she wants you to talk: 'encouraging' warm and steady, 'plain' direct and short, 'hype' loud gym-floor energy. Change it the moment she reacts to your tone — 'stop being so chirpy', 'you're a bit flat' — rather than adjusting on your own and drifting back."),
    units: z.enum(["imperial", "metric"]).optional()
      .describe("Body units: lb and feet/inches, or kg and cm"),
    foodUnits: z.enum(["imperial", "metric", "same"]).optional()
      .describe("Kitchen units: oz/cups/°F or g/ml/°C. 'same' makes food follow her body units again"),
    markOnboarded: z.boolean().optional()
      .describe("Set true once you have enough to build her first plan"),
  }),
  handler: async (input, ctx) => {
    const p = await profileOf(ctx);
    const u = input.units ?? p.units;

    const patch: Partial<typeof profiles.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.age !== undefined) {
      patch.birthYear = Number((await todayForProfile(ctx.profileId)).slice(0, 4)) - input.age;
    }
    if (input.sex !== undefined) patch.sex = input.sex;
    if (input.height !== undefined) patch.heightCm = u === "imperial" ? inToCm(input.height) : input.height;
    // currentWeight seeds the start weight only if there isn't one; startWeight
    // corrects it outright. Without the second, a typo at onboarding was
    // permanent, and every "X down from where you started" inherited it.
    if (input.currentWeight !== undefined) patch.startWeightKg = p.startWeightKg ?? weightIn(input.currentWeight, u);
    if (input.startWeight !== undefined) patch.startWeightKg = weightIn(input.startWeight, u);
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.coachTone !== undefined) patch.coachTone = input.coachTone;
    if (input.goalWeight !== undefined) patch.goalWeightKg = weightIn(input.goalWeight, u);
    if (input.goalDate !== undefined) patch.goalDate = input.goalDate;
    if (input.motivation !== undefined) patch.motivation = input.motivation;
    if (input.activityLevel !== undefined) patch.activityLevel = input.activityLevel;
    if (input.experience !== undefined) patch.experience = input.experience;
    if (input.daysPerWeek !== undefined) patch.daysPerWeek = input.daysPerWeek;
    if (input.sessionMinutes !== undefined) patch.sessionMinutes = input.sessionMinutes;
    if (input.equipment !== undefined) patch.equipment = input.equipment;
    if (input.injuries !== undefined) patch.injuries = input.injuries;
    if (input.dietaryRestrictions !== undefined) patch.dietaryRestrictions = input.dietaryRestrictions;
    if (input.dislikedFoods !== undefined) patch.dislikedFoods = input.dislikedFoods;
    if (input.cookingSkill !== undefined) patch.cookingSkill = input.cookingSkill;
    if (input.units !== undefined) patch.units = input.units;
    if (input.foodUnits !== undefined) patch.foodUnits = input.foodUnits === "same" ? null : input.foodUnits;
    if (input.markOnboarded && !p.onboardedAt) patch.onboardedAt = new Date();

    await db.update(profiles).set(patch).where(eq(profiles.id, ctx.profileId));

    // A stated current weight is also a weigh-in — otherwise her first data
    // point would be missing from the progress chart.
    if (input.currentWeight !== undefined) {
      const kg = weightIn(input.currentWeight, u);
      await db.insert(weighIns)
        .values({ profileId: ctx.profileId, date: profileToday(p), weightKg: kg })
        .onConflictDoUpdate({ target: [weighIns.profileId, weighIns.date], set: { weightKg: kg } });
    }
    return { ok: true, updated: Object.keys(patch) };
  },
});

export const logWeight = defineTool({
  name: "log_weight",
  description:
    "Record a weigh-in for a date (defaults to today). Re-logging the same date overwrites it. Returns the change since her last weigh-in and since her starting weight.",
  input: z.object({
    weight: z.number().describe("In her display units — lb by default"),
    date: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
    note: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const p = await profileOf(ctx);
    const kg = weightIn(input.weight, p.units);
    const date = input.date ?? profileToday(p);
    if (isFuture(date, profileToday(p))) return { ok: false, error: FUTURE_DATE_ERROR };

    const [prev] = await db
      .select()
      .from(weighIns)
      .where(eq(weighIns.profileId, ctx.profileId))
      .orderBy(desc(weighIns.date))
      .limit(1);

    await db.insert(weighIns)
      .values({ profileId: ctx.profileId, date, weightKg: kg, note: input.note })
      .onConflictDoUpdate({
        target: [weighIns.profileId, weighIns.date],
        set: { weightKg: kg, note: input.note },
      });

    const u = p.units;
    const toGoal = p.goalWeightKg !== null ? kg - p.goalWeightKg : null;
    return {
      logged: { date, weight: weightOut(kg, u), unit: weightLabel(u) },
      changeSinceLast: prev && prev.date !== date ? weightOut(kg - prev.weightKg, u) : null,
      changeSinceStart: p.startWeightKg !== null ? weightOut(kg - p.startWeightKg, u) : null,
      remainingToGoal: weightOut(toGoal, u),
    };
  },
});

export const getWeightHistory = defineTool({
  name: "get_weight_history",
  description:
    "Her weigh-in history, newest first, with the smoothed trend. Read `trend` and `weeklyChange`, not the last reading: a day's weight moves on water, food and where she is in her cycle, and calling that a gain is wrong about half the time. When `trendConfidence` is 'low' there is not enough recent data to say which way it is going — say that instead of picking a direction.",
  input: z.object({ limit: z.number().optional().describe("Default 30") }),
  handler: async (input, ctx) => {
    const p = await profileOf(ctx);
    const rows = await db
      .select()
      .from(weighIns)
      .where(eq(weighIns.profileId, ctx.profileId))
      .orderBy(desc(weighIns.date))
      .limit(input.limit ?? 30);
    const u = p.units;
    const t = weightTrend(
      rows.map((r) => ({ date: r.date, weightKg: r.weightKg })),
      await todayForProfile(ctx.profileId),
    );
    return {
      unit: weightLabel(u),
      trend: t.trendKg === null ? null : weightOut(t.trendKg, u),
      // Null unless the data supports it — see lib/trend.ts. A number here is
      // read as a fact about her body.
      weeklyChange: t.weeklyChangeKg === null ? null : weightOut(t.weeklyChangeKg, u),
      trendConfidence: t.confidence,
      weighInsLast14Days: t.weighInsLast14Days,
      daysSinceLastWeighIn: t.daysSinceLastWeighIn,
      latestReading: t.latestRawKg === null ? null : weightOut(t.latestRawKg, u),
      entries: rows.map((r) => ({ date: r.date, weight: weightOut(r.weightKg, u), note: r.note })),
      startWeight: weightOut(p.startWeightKg, u),
      goalWeight: weightOut(p.goalWeightKg, u),
      totalChange:
        rows.length > 0 && p.startWeightKg !== null
          ? weightOut(rows[0].weightKg - p.startWeightKg, u)
          : null,
    };
  },
});

export const setGoal = defineTool({
  name: "set_goal",
  description:
    "Create a long-term goal or an intermediate milestone. Good milestones are specific, dated, and close enough to feel reachable — a 4-week strength target, a habit streak, a first pull-up. Ladder several milestones toward each big goal.",
  input: z.object({
    title: z.string().describe("Short and concrete, e.g. 'Squat 95lb for 3x8'"),
    kind: z.enum(["weight", "strength", "habit", "endurance", "body"]),
    targetValue: z.number().optional().describe("lb for weight/strength, count for habit/endurance"),
    unit: z.string().optional().describe("e.g. 'lb', 'workouts/week', 'minutes'"),
    targetDate: z.string().optional().describe("YYYY-MM-DD"),
    exerciseSlug: z.string().optional().describe("For strength goals, the lift this tracks"),
  }),
  handler: async (input, ctx) => {
    const p = await profileOf(ctx);
    let exerciseId: string | null = null;
    if (input.exerciseSlug) {
      const { exercises } = await import("@/lib/db/schema");
      const [ex] = await db.select({ id: exercises.id }).from(exercises)
        .where(eq(exercises.slug, input.exerciseSlug)).limit(1);
      exerciseId = ex?.id ?? null;
    }
    const targetValue =
      input.targetValue !== undefined && (input.kind === "weight" || input.kind === "strength")
        ? weightIn(input.targetValue, p.units)
        : (input.targetValue ?? null);

    const [row] = await db.insert(goals).values({
      profileId: ctx.profileId,
      title: input.title,
      kind: input.kind,
      targetValue,
      unit: input.unit ?? null,
      targetDate: input.targetDate ?? null,
      exerciseId,
    }).returning();
    return { ok: true, goalId: row.id, title: row.title };
  },
});

export const listGoals = defineTool({
  name: "list_goals",
  description: "All her goals and milestones, with which are achieved and which are still open.",
  input: z.object({ includeAchieved: z.boolean().optional() }),
  handler: async (input, ctx) => {
    const p = await profileOf(ctx);
    const rows = await db.select().from(goals)
      .where(eq(goals.profileId, ctx.profileId))
      .orderBy(goals.sortOrder, goals.createdAt);
    const u = p.units;
    return rows
      .filter((g) => input.includeAchieved !== false || !g.achievedAt)
      .map((g) => ({
        id: g.id,
        title: g.title,
        kind: g.kind,
        target:
          g.targetValue !== null && (g.kind === "weight" || g.kind === "strength")
            ? `${weightOut(g.targetValue, u)} ${weightLabel(u)}`
            : g.targetValue !== null ? `${g.targetValue} ${g.unit ?? ""}`.trim() : null,
        targetDate: g.targetDate,
        achieved: g.achievedAt !== null,
      }));
  },
});

export const achieveGoal = defineTool({
  name: "achieve_goal",
  description:
    "Mark a milestone as hit. Call this the moment the data supports it — then celebrate it specifically, naming what she did.",
  input: z.object({ goalId: z.string() }),
  handler: async (input, ctx) => {
    const [row] = await db.update(goals)
      .set({ achievedAt: new Date() })
      .where(and(eq(goals.id, input.goalId), eq(goals.profileId, ctx.profileId)))
      .returning();
    if (!row) throw new Error("Goal not found");
    return { ok: true, title: row.title, achievedAt: row.achievedAt };
  },
});


export const setRestDefaults = defineTool({
  name: "set_rest_defaults",
  description:
    "Sets how long she rests between sets — one number for everything, or a different one per muscle group. Use it whenever she says a rest is too long or too short ('ninety seconds is ages', 'I need three minutes on squats'). Seconds. Pass null for `seconds` to go back to whatever each movement's plan says, and an empty object for `byGroup` to clear the per-group ones. Groups are Legs, Glutes, Back, Chest, Shoulders, Arms, Core, Conditioning, Mobility.",
  input: z.object({
    seconds: z.number().nullable().optional()
      .describe("Her default for every movement. Null follows the plan."),
    byGroup: z.record(z.string(), z.number()).optional()
      .describe("Per muscle group, e.g. {\"Legs\": 180}. Merged with what is already set; an empty object clears them all."),
  }),
  handler: async (input, ctx) => {
    const [current] = await db
      .select({ byGroup: profiles.restByGroup })
      .from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);

    // Merged, not replaced — "three minutes on legs" should not wipe the two
    // minutes she set for back last week. An empty object is the clear.
    let byGroup = current?.byGroup ?? null;
    if (input.byGroup !== undefined) {
      const merged = Object.keys(input.byGroup).length === 0
        ? {}
        : { ...(byGroup ?? {}), ...input.byGroup };
      const kept: Record<string, number> = {};
      for (const [group, value] of Object.entries(merged)) {
        if (!REST_GROUPS.includes(group as (typeof REST_GROUPS)[number])) continue;
        const n = Math.round(value);
        if (n >= MIN_REST_SECONDS && n <= MAX_REST_SECONDS) kept[group] = n;
      }
      byGroup = Object.keys(kept).length === 0 ? null : kept;
    }

    const seconds = input.seconds === undefined
      ? undefined
      : input.seconds === null
        ? null
        : Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, Math.round(input.seconds)));

    await db.update(profiles).set({
      ...(seconds === undefined ? {} : { defaultRestSeconds: seconds }),
      ...(input.byGroup === undefined ? {} : { restByGroup: byGroup }),
    }).where(eq(profiles.id, ctx.profileId));

    return {
      ok: true,
      defaultRestSeconds: seconds === undefined ? undefined : seconds,
      byGroup: byGroup ?? {},
      note: "Applies from her next set — the timer reads it when a rest starts.",
    };
  },
});
