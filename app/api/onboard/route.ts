import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { profiles, weighIns } from "@/lib/db/schema";
import { currentUser } from "@/lib/session";
import { getProfile, profileToday } from "@/lib/profile";
import { inToCm, weightIn } from "@/lib/units";
import { nutritionTargets } from "@/lib/nutrition";
import { runTool } from "@/lib/tools";
import { weekStart } from "@/lib/date";
import { audit } from "@/lib/audit";
import {
  instantiateMealPlan, instantiateWorkoutPlan, pickMealTemplate, pickWorkoutTemplate,
} from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  name: z.string().min(1).max(60),
  age: z.number().min(13).max(100),
  sex: z.enum(["female", "male", "other"]),
  heightIn: z.number().min(36).max(90),
  currentWeight: z.number().min(50).max(600),
  goalWeight: z.number().min(50).max(600),
  goalDate: z.string().optional(),
  daysPerWeek: z.number().min(1).max(7),
  sessionMinutes: z.number().min(10).max(180),
  equipment: z.array(z.string()).min(1),
  experience: z.enum(["beginner", "returning", "intermediate", "advanced"]),
  injuries: z.array(z.string()).default([]),
  dietaryRestrictions: z.array(z.string()).default([]),
  dislikedFoods: z.array(z.string()).default([]),
  motivation: z.string().max(400).optional(),
  units: z.enum(["imperial", "metric"]).default("imperial"),
  timezone: z.string().optional(),
});

/**
 * Everything the first run needs, in one call: save what she typed, then build
 * her a real week and a real meal plan before she ever sees the app.
 *
 * The alternative — land her in an empty app and make her talk her way to a
 * plan — is the thing that felt tedious. A form is simply faster than a
 * conversation for age, height and weight; the coach's value is what happens
 * afterwards.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Some answers were missing", issues: parsed.error.issues.map((i) => i.path.join(".")) },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const profile = await getProfile(user.id);
  const u = input.units;

  const currentKg = weightIn(input.currentWeight, u);

  await db.update(profiles).set({
    name: input.name,
    birthYear: new Date().getFullYear() - input.age,
    sex: input.sex,
    heightCm: u === "imperial" ? inToCm(input.heightIn) : input.heightIn,
    startWeightKg: currentKg,
    goalWeightKg: weightIn(input.goalWeight, u),
    goalDate: input.goalDate ?? null,
    motivation: input.motivation ?? null,
    experience: input.experience,
    daysPerWeek: input.daysPerWeek,
    sessionMinutes: input.sessionMinutes,
    equipment: input.equipment,
    injuries: input.injuries,
    dietaryRestrictions: input.dietaryRestrictions,
    dislikedFoods: input.dislikedFoods,
    units: u,
    timezone: input.timezone ?? null,
    onboardedAt: new Date(),
  }).where(eq(profiles.id, profile.id));

  // Her starting weight is also her first data point, or the progress chart
  // begins empty on day one.
  const today = profileToday({ timezone: input.timezone ?? null });
  await db.insert(weighIns)
    .values({ profileId: profile.id, date: today, weightKg: currentKg })
    .onConflictDoUpdate({ target: [weighIns.profileId, weighIns.date], set: { weightKg: currentKg } });

  await audit("onboarding.completed", { req, detail: { userId: user.id } });

  // Targets from her own numbers: a deficit she can hold, and enough protein to
  // keep muscle while losing fat.
  const targets = nutritionTargets({
    weightKg: currentKg,
    heightIn: input.heightIn,
    age: input.age,
    sex: input.sex,
    daysPerWeek: input.daysPerWeek,
    units: u,
  });
  const ctx = { profileId: profile.id };

  const week = weekStart(today);
  const fresh = await getProfile(user.id); // re-read: the update above is what selection matches on

  // Templates first. Instantiating a ready-made week is instant and cannot
  // fail, where a model call is ~45 seconds and occasionally returns something
  // unusable — which used to drop her into an empty app having just promised
  // to build her a plan.
  const [workoutTemplate, mealTemplate] = await Promise.all([
    pickWorkoutTemplate(fresh),
    pickMealTemplate(fresh, targets.calorieTarget),
  ]);

  const results = await Promise.all([
    (async () => {
      if (workoutTemplate) {
        await instantiateWorkoutPlan(fresh.id, workoutTemplate, week);
        return "template" as const;
      }
      // Nothing in the library fits her setup — fall back to generating one.
      const r = (await runTool("create_weekly_plan", { weekStart: week }, ctx)) as { ok?: boolean };
      return r?.ok ? ("generated" as const) : ("failed" as const);
    })(),
    (async () => {
      if (mealTemplate) {
        await instantiateMealPlan(
          fresh.id, mealTemplate, week, targets.calorieTarget, targets.proteinTargetG,
        );
        return "template" as const;
      }
      const r = (await runTool("create_meal_plan", { ...targets, weekStart: week }, ctx)) as { ok?: boolean };
      return r?.ok ? ("generated" as const) : ("failed" as const);
    })(),
  ]);

  return Response.json({ ok: true, plan: results[0], meals: results[1] });
}
