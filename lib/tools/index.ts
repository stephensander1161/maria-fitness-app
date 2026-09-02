import type Anthropic from "@anthropic-ai/sdk";
import { toAnthropicTool, type Tool, type ToolContext } from "./define";
import * as profile from "./profile";
import * as training from "./training";
import * as nutrition from "./nutrition";
import * as ideas from "./ideas";
import * as body from "./measurements";
import * as feedback from "./feedback";
import * as budget from "./budget";
import * as boost from "./boost";
import * as templates from "./templates";
import * as progression from "./progression";
import * as foodTools from "./foods";
import * as photos from "./photos";
import * as pantry from "./pantry";
import * as setup from "./setup";
import * as transcript from "./transcript";
import * as shopping from "./shopping";

/**
 * The single registry. The agent loop reads `anthropicTools` from it; the UI's
 * /api/action route calls `runTool` on it. Adding a capability means adding one
 * entry here and both surfaces gain it at once.
 *
 * The list is sorted by name at construction rather than by hand. Tool order is
 * the first thing hashed for prompt caching (tools → system → messages), so a
 * reshuffle silently invalidates the cache on every request — and hand-ordering
 * had already drifted. Sorting here makes that impossible.
 */
const all: Tool[] = [
  profile.achieveGoal,
  photos.addProgressPhoto,
  training.addExerciseToDay,
  training.adjustPlanDay,
  nutrition.createMealPlan,
  training.createWeeklyPlan,
  photos.deleteProgressPhoto,
  training.finishWorkout,
  nutrition.getDayNutrition,
  training.getExerciseGuide,
  training.getExerciseHistory,
  progression.getProgression,
  templates.applyTemplate,
  templates.listTemplates,
  templates.suggestTemplate,
  boost.getBoost,
  budget.getCoachUsage,
  nutrition.getFact,
  feedback.listFeedback,
  body.getMeasurements,
  body.getMeasuringGuide,
  nutrition.getMealPlan,
  nutrition.getMealRecipe,
  pantry.getPantry,
  pantry.clearPantry,
  pantry.addToPantry,
  pantry.setPantryItem,
  pantry.removePantryItem,
  pantry.markShoppingBought,
  setup.runPlanSetup,
  setup.skipPlanSetup,
  transcript.exportTranscript,
  nutrition.getNutritionTrend,
  ideas.suggestExercises,
  ideas.suggestMeals,
  nutrition.getRecentMeals,
  nutrition.getShoppingList,
  shopping.sendShoppingListToInstacart,
  training.deleteSet,
  training.correctSet,
  training.getPlan,
  profile.getProfile,
  training.getWeekReview,
  profile.getWeightHistory,
  profile.listGoals,
  photos.listProgressPhotos,
  body.logMeasurement,
  feedback.submitFeedback,
  training.removeExerciseFromDay,
  foodTools.findRecipes,
  foodTools.lookupFood,
  nutrition.logMeal,
  nutrition.updateMealLog,
  nutrition.clearMealLogs,
  training.logSet,
  profile.logWeight,
  foodTools.searchIngredient,
  foodTools.searchFoodLibrary,
  training.searchExercises,
  budget.setCoachBudget,
  profile.setGoal,
  training.startWorkout,
  nutrition.removeMealLog,
  nutrition.swapMeal,
  profile.updateProfile,
];

// Plain comparison, not localeCompare: the ordering must not depend on the
// server's locale, or the cache key changes with the environment.
const ordered = [...all].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

export const registry = new Map<string, Tool>(ordered.map((t) => [t.name, t]));

export const anthropicTools: Anthropic.Tool[] = ordered
  .filter((t) => !t.uiOnly)
  .map(toAnthropicTool);

export async function runTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = registry.get(name);
  if (!tool) return { error: `Unknown tool '${name}'` };
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    // Also logged, not only handed back. A rejection is invisible otherwise:
    // the model reads it, tries again, and if it gives up it may still narrate
    // success — which is how a turn can end with "logged that" and no row. The
    // rejected keys are recorded, never their values, since those are her data.
    console.error("[tool-reject]", name, Object.keys((input ?? {}) as object).join(","), issues.join("; "));
    // Hand the model a correctable message instead of throwing the turn away.
    return { error: "Invalid arguments", issues };
  }
  return tool.handler(parsed.data, ctx);
}

export type { ToolContext };
