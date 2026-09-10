import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { anthropicTools, registry, runTool, type ToolContext } from "@/lib/tools";
import { MAX_TOKENS, MAX_TOOL_ITERATIONS, MODEL } from "./model";
import { loadHistory, saveMessage } from "./history";
import { TurnGuard } from "./guard";
import { isWriteTool } from "./tool-kind";
import { recordError } from "@/lib/errors";
import { buildSystem } from "./system";
import { goalDirectionSignal, goalProgress, recompositionSignal, todaySnapshot, weightSignal } from "@/lib/progress";
import { postpartumSignal, type PostpartumSymptom } from "@/lib/postpartum";
import { profileToday } from "@/lib/profile";
import { checkSpendAllowed, recordUsage, todaySpend } from "@/lib/limits";
import { allowanceLeftPct } from "@/lib/allowance-pct";
import { planSummary } from "@/lib/views";
import { complaintSummary } from "@/lib/tools/swaps";
import { cycleSignal } from "@/lib/tools/cycle-tools";
import { sleepSignal, sleepTarget } from "@/lib/sleep";
import { phaseSignal } from "@/lib/tools/phases";
import { preppedSummary } from "@/lib/tools/batch-cooking";
import type { Profile } from "@/lib/db/schema";

export type CoachEvent =
  /** Her message is in the transcript. Sent before the first model call, so
   *  the browser knows whether a later failure means it was lost or kept. */
  | { type: "accepted" }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "done" }
  /** How much of today's coach allowance is left, sent as a turn ends. */
  | { type: "allowance"; leftPct: number }
  | { type: "error"; message: string; code?: "spent" | "rate" | "messages" };

// Lazy for the same reason as the planner: importing this module must not
// require credentials.
let _client: Anthropic | undefined;
const anthropic = (): Anthropic =>
  (_client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

// Activity labels live in lib/tool-labels.ts — one map, shared with the
// browser, so the two cannot drift apart again.
export { toolLabel } from "@/lib/tool-labels";

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
  opts: {
    silent?: boolean; source?: "app" | "eval"; save?: string;
    /**
     * Who is holding the phone. The profile is *what is being worked on*; the
     * account is *who you are*, and the coach was greeting whoever signed in
     * by the name on the profile. One is a training record, the other is a
     * person being spoken to.
     */
    speakingTo?: string | null;
  } = {},
): AsyncGenerator<CoachEvent> {
  const ctx: ToolContext = { profileId: profile.id };
  // Her today, not the server's. She trains at 7pm in Denver, the server is
  // already on tomorrow, and the block would tell the coach she has logged
  // nothing — so it asks her to retype the session she just finished, which is
  // the exact failure todaySnapshot exists to prevent.
  const her = profileToday(profile);
  const [snapshot, plan, milestones, recomp, weight, hurts, cycle, fridge, aim, sleep] = await Promise.all([
    todaySnapshot(profile.id, profile.units, her),
    planSummary(profile.id, profile.units, her),
    goalProgress(profile.id, profile.units),
    recompositionSignal(profile.id, profile.units),
    weightSignal(profile.id, profile.units, her),
    complaintSummary(profile.id),
    cycleSignal(profile.id, her),
    preppedSummary(profile.id, her),
    goalDirectionSignal(profile),
    // Short sleep explains a flat session more often than anything else
    // the block already carries, and the app used to be silent about it.
    sleepSignal(profile.id, her, sleepTarget(profile)),
  ]);
  // Not a promise: everything it needs is already on the profile.
  const recovery = postpartumSignal({
    birthDate: profile.postpartumBirthDate,
    delivery: profile.postpartumDelivery,
    clearedAt: profile.postpartumClearedAt,
    breastfeeding: profile.breastfeeding,
    symptoms: (profile.postpartumSymptoms ?? []) as PostpartumSymptom[],
  }, her);
  const system = buildSystem(
    profile,
    // Her direction sits with the weight, because that is where getting it
    // backwards does the damage: the app was weight-loss-first everywhere, and
    // told someone trying to gain that their rising scale was a problem.
    [recovery, snapshot, plan, weight, aim, cycle && `IMPORTANT: ${cycle}`, phaseSignal(profile, her),
      fridge, sleep, milestones, hurts, recomp && `IMPORTANT: ${recomp}`]
      .filter(Boolean).join("\n\n"),
    opts.speakingTo ?? null,
  );

  const history = await loadHistory(profile.id);
  const userContent: Anthropic.ContentBlockParam[] = [{ type: "text", text: userText }];
  // What the model is sent and what the transcript keeps are not always the
  // same thing: a message sent from a screen carries that screen's contents,
  // and she should see her own sentence in the conversation, not the briefing
  // wrapped around it.
  const savedContent: Anthropic.ContentBlockParam[] =
    opts.save === undefined ? userContent : [{ type: "text", text: opts.save }];
  const conversation: Anthropic.MessageParam[] = [
    ...markCachePoint(history),
    { role: "user", content: userContent },
  ];

  // A silent turn is a system nudge (e.g. the daily check-in), not something
  // she typed — keep it out of the visible transcript but in the model's context.
  if (!opts.silent) {
    await saveMessage(profile.id, "user", savedContent);
    // Said out loud: the client used to put her words back in the box after any
    // failure, including one that happened *after* this line — so she sent it
    // again and the conversation held it twice.
    yield { type: "accepted" };
  }

  try {
    let emittedText = false;
    // Time, repetition and fan-out, per turn — see lib/agent/guard.ts.
    const guard = new TurnGuard(
      Date.now(),
      (name) => registry.get(name)?.slow === "planner",
      (name) => registry.get(name)?.repeatable !== undefined,
      isWriteTool,
    );

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      // Re-checked each iteration, not just once per turn. The loop runs up
      // to MAX_TOOL_ITERATIONS times recording usage as it goes, so a single
      // turn could carry on well past the daily cap before anything looked.
      const budget = await checkSpendAllowed(profile.id);
      if (!budget.allowed) {
        yield { type: "error", message: budget.reason, code: budget.code };
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
        // Say how much is left before saying done, so the thread can warn
        // her while she can still act on it. Usage for this turn is already
        // recorded above, so the figure includes what she just spent.
        const spend = await todaySpend(profile.id);
        yield { type: "allowance", leftPct: allowanceLeftPct(spend.costMicros, spend.limitMicros) };
        yield { type: "done" };
        return;
      }

      const calls = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // Refused calls are answered, never run: a repeat of a call this turn,
      // a second planner, or anything at all once the turn is out of time.
      const admissions = guard.admit(calls, Date.now());
      const admitted = admissions.filter((a) => a.refusal === null).map((a) => a.call);

      // Say what is running before it runs. These used to be emitted after
      // the await, so "logging your set" appeared at the moment it finished.
      for (const call of admitted) yield { type: "tool", name: call.name, status: "running" };

      // Run in parallel, but return every result in one user message — splitting
      // them teaches the model to stop batching tool calls.
      const results = await Promise.all(
        admissions.map(async ({ call, refusal }): Promise<Anthropic.ToolResultBlockParam> => {
          if (refusal !== null) {
            return { type: "tool_result", tool_use_id: call.id, is_error: true, content: refusal };
          }
          try {
            const result = await runTool(call.name, call.input, ctx);
            return {
              type: "tool_result",
              tool_use_id: call.id,
              content: JSON.stringify(result ?? { ok: true }),
            };
          } catch (err) {
            /*
              A tool that throws used to be completely invisible.
              The raw message went to the model and nowhere else — nothing in
              app_errors, no line in the console — so the only trace of a
              failed write was the coach paraphrasing it to her as "there's a
              database issue on the server side", and afterwards there was no
              way to find out what had actually gone wrong.

              And the raw message is the wrong thing to hand over twice.
              A failed query reads "Failed query: insert into "meal_logs" …
              params: <what she ate>" — her data and the schema, written into
              the transcript as a tool_result and sent back to the model on
              every turn afterwards. The model gets a short instruction; the
              detail goes to app_errors, where the console can find it.
            */
            const detail = err instanceof Error ? err.message : String(err);
            console.error("[tool-threw]", call.name, detail);
            void recordError({
              route: "/api/chat", method: "TOOL", kind: `tool:${call.name}`,
              message: detail.slice(0, 2000),
              stack: err instanceof Error ? err.stack?.slice(0, 2000) ?? null : null,
            }).catch(() => { /* the logger failing must not take the turn down */ });
            return {
              type: "tool_result",
              tool_use_id: call.id,
              is_error: true,
              content: `${call.name} did not run — nothing was saved. Do not retry it: say plainly that it did not save, and offer the screen she can do it on instead. Never describe it as a database or server problem.`,
            };
          }
        }),
      );

      await saveMessage(profile.id, "user", results);
      conversation.push({ role: "user", content: results });

      for (const call of admitted) yield { type: "tool", name: call.name, status: "done" };
    }

    yield { type: "error", message: "The coach got stuck in a loop. Try rephrasing that." };
  } catch (err) {
    // Specific in the log, generic to her. The API's own message used to be
    // shown verbatim — a wall of tool ids and a request id, which is both
    // reconnaissance and unreadable. It goes to app_errors, where the admin
    // console lists it; she gets a sentence and a way to try again.
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[coach]", detail);
    await recordError({
      route: "/api/chat", method: "POST", kind: "coach",
      message: (err instanceof Anthropic.APIError ? `${err.status} ` : "") + detail.slice(0, 500),
      stack: err instanceof Error && err.stack ? err.stack.slice(0, 4000) : null,
    }).catch(() => {});
    const message =
      err instanceof Anthropic.APIError && (err.status === 529 || err.status === 429)
        ? "The coach is busy right now. Try again in a minute."
        : "The coach could not answer that. Try sending it again.";
    yield { type: "error", message };
  }
}
