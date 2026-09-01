import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises, type Profile } from "@/lib/db/schema";
import { owns } from "@/lib/templates";
import { env } from "@/lib/env";
import { DAY_NAMES } from "@/lib/date";
import { heightLabel, weightLabel, weightOut } from "@/lib/units";
import { checkSpendAllowed, recordUsage, type UsageSource } from "@/lib/limits";
import { MAX_TOKENS, PLANNER_MODEL, PLANNER_PRICING } from "./model";

/**
 * Plan and meal generation, as a dedicated call on a stronger model.
 *
 * Previously the chat model emitted the whole week as tool input, which is
 * where every observed failure lived: it invented exercise slugs and needed a
 * retry, its meal plans landed ~200 kcal/day under target, and one turn spent
 * 86 seconds building a plan nobody asked for. Splitting it out means the chat
 * model only decides *when* to plan, and the planner gets the real exercise
 * catalogue rather than guessing at names.
 */

/**
 * Constructed on first use, not at module load. The tool registry imports this
 * transitively, so an eager client would make merely *listing* the tools
 * require an API key — which broke the structural tests, and would break any
 * build step that touches the registry.
 */
let _client: Anthropic | undefined;
const anthropic = (): Anthropic =>
  (_client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

const planExercise = z.object({
  slug: z.string().describe("Exact slug from the catalogue — anything else is rejected"),
  sets: z.number(),
  reps: z.number().describe("Reps per set, or seconds for a timed hold"),
  weight: z.number().nullable().optional()
    .describe("Working weight in her units; omit for bodyweight or when unknown"),
  restSeconds: z.number().optional(),
  notes: z.string().optional().describe("A short form cue for this movement"),
});

export const weekDraft = z.object({
  title: z.string().default("This week")
    .describe('Short name for the week, e.g. "Week 1 — Full Body Foundation"'),
  rationale: z.string().default("")
    .describe("Two or three sentences addressed to her, explaining why the week looks like this"),
  days: z.array(z.object({
    dayOfWeek: z.number().describe("0=Monday … 6=Sunday. Include all seven."),
    title: z.string().optional().describe('Name for the day, e.g. "Lower Body" or "Rest"'),
    focus: z.string().optional().describe("What this day is for, in a few words"),
    isRest: z.boolean().optional().describe("True for non-training days"),
    notes: z.string().optional().describe("A cue or caution shown next to the day"),
    exercises: z.array(planExercise).optional(),
  })).describe("All seven days, in order"),
});

export const mealDraft = z.object({
  calorieTarget: z.number(),
  proteinTargetG: z.number(),
  carbTargetG: z.number().optional(),
  fatTargetG: z.number().optional(),
  rationale: z.string().default("")
    .describe("Two or three sentences addressed to her about the targets and the week"),
  meals: z.array(z.object({
    dayOfWeek: z.number().describe("0=Monday … 6=Sunday"),
    slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    title: z.string(),
    calories: z.number(),
    proteinG: z.number(),
    carbsG: z.number().optional(),
    fatG: z.number().optional(),
    ingredients: z.array(z.string()).optional(),
    steps: z.array(z.string()).optional(),
    prepMinutes: z.number().optional(),
  })),
});

/** One forced tool call, so the response is always the structure we asked for. */
async function draft<S extends z.ZodType>(
  name: string,
  description: string,
  schema: S,
  system: string,
  prompt: string,
  source: UsageSource,
  profileId: string,
): Promise<z.infer<S>> {
  // Gated before the call, not merely recorded after it. Usage was going onto
  // the ledger with nothing reading it back on this path, so a caller outside
  // the chat route — /api/action reaches every registered tool, and two of
  // them plan — could run past the daily cap and only be noticed afterwards.
  const budget = await checkSpendAllowed(profileId);
  if (!budget.allowed) throw new Error(budget.reason);

  const response = await anthropic().messages.create({
    model: PLANNER_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    tools: [{
      name,
      description,
      input_schema: z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Anthropic.Tool.InputSchema,
    }],
    tool_choice: { type: "tool", name },
    messages: [{ role: "user", content: prompt }],
  });

  // Planner spend is real and belongs on the same ledger as the chat turns.
  await recordUsage(response.usage, source, PLANNER_PRICING, profileId);

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!block) throw new Error("Planner returned no plan.");

  const parsed = schema.safeParse(block.input);
  if (!parsed.success) {
    // Name the field. "expected string, received undefined" with no path is
    // undebuggable, and this failure is silent from the outside.
    const where = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Planner returned an unusable plan — ${where}`);
  }
  return parsed.data;
}

function profileBrief(p: Profile): string {
  const u = p.units;
  const age = p.birthYear ? new Date().getFullYear() - p.birthYear : null;
  return [
    `Name: ${p.name ?? "unknown"}`,
    `Age ${age ?? "?"}, ${p.sex ?? "unspecified"}, ${heightLabel(p.heightCm, u)}`,
    `Weight ${weightOut(p.startWeightKg, u) ?? "?"}${weightLabel(u)}, goal ${weightOut(p.goalWeightKg, u) ?? "?"}${weightLabel(u)}${p.goalDate ? ` by ${p.goalDate}` : ""}`,
    `Why it matters to her: ${p.motivation ?? "not stated"}`,
    `Experience: ${p.experience ?? "unknown"}. Available ${p.daysPerWeek ?? "?"} days/week, ${p.sessionMinutes ?? "?"} minutes.`,
    `Equipment: ${p.equipment.join(", ") || "unknown"}`,
    `Injuries and limitations: ${p.injuries.join(", ") || "none"}`,
    `Dietary restrictions: ${p.dietaryRestrictions.join(", ") || "none"}. Dislikes: ${p.dislikedFoods.join(", ") || "none"}.`,
    `Cooking confidence: ${p.cookingSkill ?? "unknown"}. Body units: ${u}.`,
  ].join("\n");
}

/** Only movements she can actually perform, so slugs cannot be invented. */
async function catalogue(p: Profile): Promise<string> {
  const owned = p.equipment.length ? p.equipment : ["bodyweight"];
  const rows = await db
    .select({
      slug: exercises.slug, name: exercises.name, category: exercises.category,
      muscles: exercises.primaryMuscles, equipment: exercises.equipment,
    })
    .from(exercises);

  // Filtered in JS with the same predicate the template picker uses. The SQL
  // version built a regex out of her equipment strings, which had two faults:
  // "full gym" matched only exercises literally saying "full gym", so the
  // best-equipped user got a bodyweight catalogue; and an entry like
  // "kettlebell (16kg)" is not a valid pattern, while "." matches everything.
  // A hundred and fifty rows is nothing to filter here, and it removes the
  // third copy of this logic.
  return rows
    .filter((r) => r.equipment.some((kit) => owns(owned, kit)) || r.equipment.length === 0)
    .map((r) => `${r.slug} — ${r.name} [${r.category}] ${r.muscles.join("/")}`)
    .join("\n");
}

const PLANNER_SYSTEM = `You write training and nutrition plans for one person, to be executed by an app.

Every exercise you use MUST come from the catalogue you are given, referenced by its exact slug. There is no other library; a slug that is not in the list will be rejected.

Programme sensibly for who she actually is: progressive overload paced for her experience, compound movements before isolation, volume matched to the days and minutes she really has rather than an ideal. Respect every injury by choosing a different movement, never by telling her to push through. All seven days must be present, with non-training days marked as rest.`;

const MEAL_SYSTEM = `You write weekly meal plans for one person, to be executed by an app.

Hard requirements: every day's meals must sum to within 100 kcal of the calorie target and must reach the protein target. A plan that quietly lands under target every day is one she will be hungry on and abandon. Never use an ingredient she has said she dislikes or cannot eat. Match her cooking confidence — if it is minimal, that means assembly, one pans, and shortcuts like rotisserie chicken, not knife skills.

Vary the week. Repeating the same four dinners is how people stop cooking.`;

export async function planWeek(
  profile: Profile,
  intent: { focus?: string; notes?: string; weekStart: string; previous?: string },
  source: UsageSource = "app",
) {
  const profileId = profile.id;
  return draft(
    "emit_plan", "Emit the full week of training.", weekDraft, PLANNER_SYSTEM,
    [
      profileBrief(profile),
      ``,
      `Available exercises (slug — name [category] muscles):`,
      await catalogue(profile),
      ``,
      intent.previous ? `Last week, for progression:\n${intent.previous}\n` : ``,
      `Build the week starting ${intent.weekStart} (dayOfWeek 0 = ${DAY_NAMES[0]}).`,
      intent.focus ? `Focus she asked for: ${intent.focus}` : ``,
      intent.notes ? `Notes: ${intent.notes}` : ``,
      ``,
      `Give the week a short title, and write the rationale directly to her in plain language, `
        + `explaining why it looks like this.`,
    ].filter(Boolean).join("\n"),
    source,
    profileId,
  );
}

export async function planMeals(
  profile: Profile,
  intent: { calorieTarget: number; proteinTargetG: number; notes?: string; weekStart: string },
  source: UsageSource = "app",
) {
  const profileId = profile.id;
  const result = await draft(
    "emit_meals", "Emit the full week of meals.", mealDraft, MEAL_SYSTEM,
    [
      profileBrief(profile),
      ``,
      `Week starting ${intent.weekStart}. Target ${intent.calorieTarget} kcal and ${intent.proteinTargetG}g protein per day.`,
      intent.notes ? `Notes: ${intent.notes}` : ``,
      ``,
      `Produce breakfast, lunch, dinner and a snack for all seven days (dayOfWeek 0 = ${DAY_NAMES[0]}), `
        + `with ingredients and short steps, and write the rationale directly to her. `
        // Stored metric like the recipe library; the app rewrites measures
        // for her kitchen on the way out, so the planner never needs to know.
        + `Write ingredient amounts and oven temperatures in metric (g, ml, °C) — the app shows them in her units.`,
    ].filter(Boolean).join("\n"),
    source,
    profileId,
  );

  // The failure that motivated moving this off the chat model was days landing
  // ~200 kcal under target, so verify rather than trust.
  const shortfalls = DAY_NAMES.map((name, dow) => {
    const kcal = result.meals.filter((m) => m.dayOfWeek === dow).reduce((n, m) => n + m.calories, 0);
    return { name, kcal, off: kcal - intent.calorieTarget };
  }).filter((d) => Math.abs(d.off) > 150);

  return { ...result, shortfalls };
}

/** Resolve slugs, reporting any the planner invented despite the catalogue. */
export async function resolveSlugs(slugs: string[]) {
  if (slugs.length === 0) return { bySlug: new Map<string, string>(), unknown: [] as string[] };
  const found = await db
    .select({ id: exercises.id, slug: exercises.slug })
    .from(exercises)
    .where(inArray(exercises.slug, slugs));
  const bySlug = new Map(found.map((e) => [e.slug, e.id]));
  return { bySlug, unknown: slugs.filter((s) => !bySlug.has(s)) };
}
