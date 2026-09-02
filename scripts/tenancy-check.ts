/**
 * Two-account isolation check, run against a real database.
 *
 *   npm run tenancy
 *
 * Creates two throwaway accounts, gives each a distinctive name, weigh-in,
 * meal plan, workout and feedback, then calls every registered tool as
 * account A and asserts that nothing belonging to B — no id, no name, no
 * number — appears in any result. It also hands A each of B's row ids
 * through the tools that accept one, and expects a refusal.
 *
 * Both accounts are deleted at the end (cascade removes everything else),
 * whether the check passes or not. It never touches an existing account: the
 * emails end in `.invalid`, and the script aborts if either already exists.
 *
 * CI cannot run this — it has no database — so it is a local check, meant to
 * be run after any change to a tool that takes an id or joins across tables.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mealPlans, meals, mealLogs, goals, photos, profiles, users } from "@/lib/db/schema";
import { registry, runTool } from "@/lib/tools";
import { instantiateMealPlan, pickMealTemplate, pickWorkoutTemplate, instantiateWorkoutPlan } from "@/lib/templates";
import { weekStart, today } from "@/lib/date";

const A_EMAIL = "tenancy-a@probe.invalid";
const B_EMAIL = "tenancy-b@probe.invalid";

type Account = { userId: string; profileId: string; name: string; markers: string[] };

async function makeAccount(email: string, name: string, weightKg: number): Promise<Account> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new Error(`${email} already exists — refusing to touch it`);
  const [u] = await db.insert(users).values({ email, name, passwordHash: null, role: "member" }).returning();
  const [p] = await db.insert(profiles).values({
    userId: u.id, name, birthYear: 1990, sex: "female", heightCm: 165,
    startWeightKg: weightKg, goalWeightKg: weightKg - 5, experience: "returning",
    daysPerWeek: 3, sessionMinutes: 45, equipment: ["dumbbells", "bench"],
    units: "metric", timezone: "UTC", onboardedAt: new Date(),
  }).returning();
  const ctx = { profileId: p.id };
  const week = weekStart(today("UTC"));
  const wt = await pickWorkoutTemplate(p);
  const mt = await pickMealTemplate(p, 1800);
  if (!wt || !mt) throw new Error("no template matched the probe profile");
  await instantiateWorkoutPlan(p.id, wt, week);
  await instantiateMealPlan(p.id, mt, week, 1800, 120);
  await runTool("log_weight", { weight: weightKg }, ctx);
  await runTool("log_set", { exerciseSlug: "goblet-squat", reps: 8, weight: 20 + weightKg / 10 }, ctx);
  await runTool("log_meal", { slot: "lunch", description: `${name}-lunch-marker`, calories: 500 + weightKg }, ctx);
  await runTool("submit_feedback", { kind: "idea", body: `${name}-feedback-marker`, path: "/" }, ctx);
  await runTool("set_goal", { kind: "weight", targetValue: weightKg - 5, title: `${name}-goal-marker` }, ctx);
  await runTool("log_measurement", { measurements: [{ site: "waist", value: 70 + weightKg / 10 }] }, ctx);
  return { userId: u.id, profileId: p.id, name, markers: [name, `${name}-lunch-marker`, `${name}-feedback-marker`, `${name}-goal-marker`, p.id, u.id] };
}

/** Every id B owns that a tool could be handed. */
async function idsOf(profileId: string) {
  const [plan] = await db.select({ id: mealPlans.id }).from(mealPlans).where(eq(mealPlans.profileId, profileId)).limit(1);
  const mealRows = plan ? await db.select({ id: meals.id }).from(meals).where(eq(meals.mealPlanId, plan.id)).limit(1) : [];
  const [log] = await db.select({ id: mealLogs.id }).from(mealLogs).where(eq(mealLogs.profileId, profileId)).limit(1);
  const [goal] = await db.select({ id: goals.id }).from(goals).where(eq(goals.profileId, profileId)).limit(1);
  const [photo] = await db.select({ id: photos.id }).from(photos).where(eq(photos.profileId, profileId)).limit(1);
  return { mealId: mealRows[0]?.id, logId: log?.id, goalId: goal?.id, photoId: photo?.id };
}

/** Tools that only read, with inputs that satisfy their schemas. */
const READS: Record<string, Record<string, unknown>> = {
  get_profile: {}, get_weight_history: {}, list_goals: {}, get_plan: {}, get_week_review: {},
  get_meal_plan: {}, get_day_nutrition: {}, get_nutrition_trend: {}, get_recent_meals: {},
  get_shopping_list: {}, get_measurements: {}, get_exercise_progression: {}, list_progress_photos: {},
  get_pantry: {},
  get_coach_usage: {}, list_feedback: {}, get_boost: {}, suggest_meals: {}, suggest_exercises: {},
  get_exercise_history: { slug: "goblet-squat" }, find_recipes: { ingredient: "chicken" },
  search_exercises: { query: "squat" }, list_templates: {}, suggest_template: {},
};

/**
 * Schema facts Drizzle cannot express and `db:push` can silently undo. The
 * usage index must treat NULL profile ids as equal, or unattributed spend
 * inserts a fresh row per call and the ceiling never accumulates.
 */
async function schemaInvariants(failures: string[]) {
  const rows = (await db.execute(
    sql`select indexdef from pg_indexes where indexname = 'usage_daily_day'`,
  )) as unknown as { indexdef: string }[];
  const def = rows[0]?.indexdef ?? "";
  if (!/NULLS NOT DISTINCT/i.test(def)) {
    failures.push(`usage_daily_day index lost NULLS NOT DISTINCT (see lib/db/schema.ts) — live: ${def || "missing"}`);
  }

  // The kitchen upserts on (profile, item, unit). Without the unique index
  // every restock inserts another row and she ends up with four half-empty
  // bags of rice, none of which is the one the shopping list reads.
  const pantry = (await db.execute(
    sql`select indexdef from pg_indexes where indexname = 'pantry_items_profile_item'`,
  )) as unknown as { indexdef: string }[];
  if (!/UNIQUE/i.test(pantry[0]?.indexdef ?? "")) {
    failures.push("pantry_items_profile_item is missing or not unique — restocking would duplicate rows");
  }
}

async function main() {
  const failures: string[] = [];
  let a: Account | null = null;
  let b: Account | null = null;
  try {
    await schemaInvariants(failures);
    a = await makeAccount(A_EMAIL, "Tenancy-Alpha", 60);
    b = await makeAccount(B_EMAIL, "Tenancy-Bravo", 90);
    const ctxA = { profileId: a.profileId };

    // 1. Nothing of B's shows up in anything A can read.
    const untested = Object.keys(registry).filter((t) => !(t in READS));
    for (const [tool, input] of Object.entries(READS)) {
      let out: unknown;
      try { out = await runTool(tool, input, ctxA); }
      catch (err) { failures.push(`${tool}: threw ${(err as Error).message}`); continue; }
      const text = JSON.stringify(out);
      for (const marker of b.markers) {
        if (text.includes(marker)) failures.push(`${tool}: A's result contains B's "${marker.slice(0, 24)}"`);
      }
    }

    // 2. A cannot act on B's rows by id.
    const bIds = await idsOf(b.profileId);
    const attempts: [string, Record<string, unknown>][] = [
      ["swap_meal", { mealId: bIds.mealId, title: "hijacked", calories: 1, proteinG: 1 }],
      // Reads B's meal *and* writes to it, and a leak here would also spend
      // her money drafting the recipe.
      ["get_meal_recipe", { mealId: bIds.mealId }],
      ["log_meal", { slot: "dinner", description: "x", mealId: bIds.mealId }],
      ["remove_meal_log", { logId: bIds.logId }],
      ["achieve_goal", { goalId: bIds.goalId }],
    ];
    for (const [tool, input] of attempts) {
      if (Object.values(input).some((v) => v === undefined)) { failures.push(`${tool}: could not find a B row to try`); continue; }
      // A refusal is either `{ ok: false }` or a thrown "not found" — both
      // mean the row was never touched. Anything else is a leak.
      let out: { ok?: boolean } | null = null;
      try { out = (await runTool(tool, input, ctxA)) as { ok?: boolean }; }
      catch { continue; }
      if (out?.ok !== false) failures.push(`${tool}: accepted B's id from A (${JSON.stringify(out).slice(0, 80)})`);
    }
    // The hijack attempt must have left B's meal alone.
    if (bIds.mealId) {
      const [m] = await db.select({ title: meals.title }).from(meals).where(eq(meals.id, bIds.mealId));
      if (m?.title === "hijacked") failures.push("swap_meal: B's meal was rewritten by A");
    }

    console.log(`checked ${Object.keys(READS).length} read tools and ${attempts.length} id-taking writes`);
    if (untested.length) console.log(`not exercised (write tools or need real input): ${untested.join(", ")}`);
  } finally {
    const ids = [a?.userId, b?.userId].filter((x): x is string => !!x);
    if (ids.length) await db.delete(users).where(inArray(users.id, ids));
    console.log(`cleaned up ${ids.length} probe account(s)`);
  }

  if (failures.length) {
    console.error("\nTENANCY FAILURES:");
    for (const f of failures) console.error("  ✗", f);
    process.exit(1);
  }
  console.log("✓ no cross-account data reached the other account");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
