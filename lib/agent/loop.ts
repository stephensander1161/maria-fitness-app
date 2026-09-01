import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { anthropicTools, runTool, type ToolContext } from "@/lib/tools";
import { MAX_TOKENS, MAX_TOOL_ITERATIONS, MODEL } from "./model";
import { loadHistory, saveMessage } from "./history";
import { buildSystem } from "./system";
import { goalProgress, recompositionSignal, todaySnapshot } from "@/lib/progress";
import { checkSpendAllowed, recordUsage } from "@/lib/limits";
import { planSummary } from "@/lib/views";
import type { Profile } from "@/lib/db/schema";

export type CoachEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "done" }
  | { type: "error"; message: string };

// Lazy for the same reason as the planner: importing this module must not
// require credentials.
let _client: Anthropic | undefined;
const anthropic = (): Anthropic =>
  (_client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

/** Friendly labels so the UI can say "checking your history" rather than
 *  leaking tool names at her. */
const TOOL_LABELS: Record<string, string> = {
  get_profile: "reading your profile",
  update_profile: "saving your details",
  log_weight: "logging your weigh-in",
  get_weight_history: "checking your weight trend",
  set_goal: "setting a milestone",
  list_goals: "reviewing your goals",
  achieve_goal: "marking a milestone hit",
  search_exercises: "searching exercises",
  get_exercise_guide: "pulling up the form guide",
  create_weekly_plan: "building your week",
  get_plan: "checking your plan",
  adjust_plan_day: "adjusting your plan",
  start_workout: "starting your session",
  log_set: "logging your set",
  finish_workout: "wrapping up your session",
  get_exercise_history: "looking up your history",
  get_week_review: "reviewing your week",
  create_meal_plan: "planning your meals",
  get_meal_plan: "checking your meal plan",
  swap_meal: "swapping that meal",
  log_meal: "logging your meal",
  get_day_nutrition: "totalling today's food",
  get_fact: "finding something worth knowing",
};

export const toolLabel = (name: string) => TOOL_LABELS[name] ?? name.replace(/_/g, " ");

/**
 * A second cache breakpoint at the end of the replayed history. The persona
 * breakpoint only covers tools + system; the conversation is the larger and
 * faster-growing half, and without this it is re-read at full price every turn.
 *
 * Each turn appends after the breakpoint, so the cached prefix stays a valid
 * prefix and keeps hitting.
 */
function markCachePoint(history: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = history.at(-1);
  if (!last || typeof last.content === "string" || last.content.length === 0) return history;

  const blocks = [...last.content];
  const final = blocks.at(-1);
  if (!final || typeof final !== "object") return history;

  blocks[blocks.length - 1] = { ...final, cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
  return [...history.slice(0, -1), { ...last, content: blocks }];
}

/**
 * Manual streaming tool loop. Manual rather than the SDK tool runner because
 * every turn is persisted block-by-block and surfaced to the browser as it
 * happens — we need the seam between iterations.
 */
export async function* runCoach(
  profile: Profile,
  userText: string,
  opts: { silent?: boolean; source?: "app" | "eval" } = {},
): AsyncGenerator<CoachEvent> {
  const ctx: ToolContext = { profileId: profile.id };
  const [snapshot, plan, milestones, recomp] = await Promise.all([
    todaySnapshot(profile.id, profile.units),
    planSummary(profile.id, profile.units),
    goalProgress(profile.id, profile.units),
    recompositionSignal(profile.id, profile.units),
  ]);
  const system = buildSystem(
    profile,
    [snapshot, plan, milestones, recomp && `IMPORTANT: ${recomp}`].filter(Boolean).join("\n\n"),
  );

  const history = await loadHistory(profile.id);
  const userContent: Anthropic.ContentBlockParam[] = [{ type: "text", text: userText }];
  const conversation: Anthropic.MessageParam[] = [
    ...markCachePoint(history),
    { role: "user", content: userContent },
  ];

  // A silent turn is a system nudge (e.g. the daily check-in), not something
  // she typed — keep it out of the visible transcript but in the model's context.
  if (!opts.silent) await saveMessage(profile.id, "user", userContent);

  try {
    let emittedText = false;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      // Re-checked each iteration, not just once per turn. The loop runs up
      // to MAX_TOOL_ITERATIONS times recording usage as it goes, so a single
      // turn could carry on well past the daily cap before anything looked.
      const budget = await checkSpendAllowed(profile.id);
      if (!budget.allowed) {
        yield { type: "error", message: budget.reason };
        return;
      }

      const stream = anthropic().messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: anthropicTools,
        messages: conversation,
      });

      // The model narrates between tool calls ("let me look that up…"). Each
      // iteration is its own paragraph, or they run together into one blob.
      let iterationHadText = false;
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          if (!iterationHadText) {
            if (emittedText) yield { type: "text", text: "\n\n" };
            iterationHadText = true;
            emittedText = true;
          }
          yield { type: "text", text: event.delta.text };
        }
      }

      const message = await stream.finalMessage();

      // Bill every iteration, not just the last — a tool loop is where a
      // runaway would actually spend the money.
      await recordUsage(message.usage, opts.source ?? "app", undefined, profile.id);

      const assistantContent = message.content as Anthropic.ContentBlockParam[];
      await saveMessage(profile.id, "assistant", assistantContent);
      conversation.push({ role: "assistant", content: assistantContent });

      if (message.stop_reason !== "tool_use") {
        yield { type: "done" };
        return;
      }

      const calls = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // Say what is running before it runs. These used to be emitted after
      // the await, so "logging your set" appeared at the moment it finished.
      for (const call of calls) yield { type: "tool", name: call.name, status: "running" };

      // Run in parallel, but return every result in one user message — splitting
      // them teaches the model to stop batching tool calls.
      const results = await Promise.all(
        calls.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
          try {
            const result = await runTool(call.name, call.input, ctx);
            return {
              type: "tool_result",
              tool_use_id: call.id,
              content: JSON.stringify(result ?? { ok: true }),
            };
          } catch (err) {
            return {
              type: "tool_result",
              tool_use_id: call.id,
              is_error: true,
              content: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );

      await saveMessage(profile.id, "user", results);
      conversation.push({ role: "user", content: results });

      for (const call of calls) yield { type: "tool", name: call.name, status: "done" };
    }

    yield { type: "error", message: "The coach got stuck in a loop. Try rephrasing that." };
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `Coach unavailable (${err.status}): ${err.message}`
        : err instanceof Error
          ? err.message
          : "Something went wrong.";
    yield { type: "error", message };
  }
}
