import type Anthropic from "@anthropic-ai/sdk";
import { toAnthropicTool, type Tool, type ToolContext } from "./define";
import * as profile from "./profile";
import * as training from "./training";
import * as nutrition from "./nutrition";

/**
 * The single registry. The agent loop reads `anthropicTools` from it; the UI's
 * /api/action route calls `runTool` on it. Adding a capability means adding one
 * entry here and both surfaces gain it at once.
 *
 * Order is fixed and alphabetical: the tool block is the first thing hashed for
 * prompt caching, so a stable order keeps the cache warm across requests.
 */
const all: Tool[] = [
  profile.achieveGoal,
  training.adjustPlanDay,
  nutrition.createMealPlan,
  training.createWeeklyPlan,
  training.finishWorkout,
  nutrition.getDayNutrition,
  training.getExerciseGuide,
  training.getExerciseHistory,
  nutrition.getFact,
  nutrition.getMealPlan,
  training.getPlan,
  profile.getProfile,
  training.getWeekReview,
  profile.getWeightHistory,
  profile.listGoals,
  nutrition.logMeal,
  training.logSet,
  profile.logWeight,
  training.searchExercises,
  profile.setGoal,
  training.startWorkout,
  nutrition.swapMeal,
  profile.updateProfile,
];

export const registry = new Map<string, Tool>(all.map((t) => [t.name, t]));

export const anthropicTools: Anthropic.Tool[] = all.map(toAnthropicTool);

export async function runTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = registry.get(name);
  if (!tool) return { error: `Unknown tool '${name}'` };
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) {
    // Hand the model a correctable message instead of throwing the turn away.
    return { error: "Invalid arguments", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return tool.handler(parsed.data, ctx);
}

export type { ToolContext };
