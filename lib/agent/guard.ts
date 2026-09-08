/**
 * What one turn of the tool loop is allowed to do.
 *
 * The loop already had a ceiling on iterations. It had nothing on *time*, on
 * *repetition*, or on how many calls one iteration could fan out — and the
 * turn that broke her conversation was a meal plan and five food lookups
 * fired together, forty seconds in, into a function that dies at sixty. The
 * planner has its own deadline now; this is the layer above it, and it is
 * pure so every rule is tested.
 *
 * A refused call is not run. It gets an error `tool_result` saying why, in
 * words the model can act on — "use the result you already have", "tell her
 * to ask for the next plan as its own message" — because a refusal the model
 * cannot understand just gets retried.
 */

export type ToolCall = { id: string; name: string; input: unknown };
export type Admission = { call: ToolCall; refusal: string | null };

/** The route is allowed 60s. Nothing new starts after this much of it. */
export const TOOL_START_CUTOFF_MS = 40_000;
/** A planner has a 45s deadline of its own and needs a few seconds after it
 *  to save and answer, so it can only start this early in the turn. */
export const PLANNER_START_CUTOFF_MS = 10_000;
export const MAX_CALLS_PER_ITERATION = 6;
export const MAX_CALLS_PER_TURN = 24;
export const MAX_PLANNERS_PER_TURN = 1;

export class TurnGuard {
  private seen = new Set<string>();
  private total = 0;
  private planners = 0;

  constructor(
    private readonly startedAt: number,
    private readonly isSlow: (name: string) => boolean,
    /** Tools whose identical repeats are her intent, not a loop. */
    private readonly isRepeatable: (name: string) => boolean = () => false,
  ) {}

  /** Decide every call in one iteration, in the order the model made them. */
  admit(calls: ToolCall[], now: number): Admission[] {
    const elapsed = now - this.startedAt;
    let admittedThisIteration = 0;

    return calls.map((call) => {
      const key = `${call.name}:${stableJson(call.input)}`;
      const slow = this.isSlow(call.name);

      let refusal: string | null = null;
      if (this.seen.has(key) && !this.isRepeatable(call.name)) {
        refusal = `${call.name} was already called with exactly this input in this turn. Use the result you already have; do not call it again.`;
      } else if (elapsed > TOOL_START_CUTOFF_MS) {
        refusal = "This turn has run out of time for more tool calls. Tell her what was done and what to ask next; do not retry.";
      } else if (slow && this.planners >= MAX_PLANNERS_PER_TURN) {
        refusal = `${call.name} builds a plan with its own model call, and one plan per message is the limit. Tell her the first is built and to ask for this one as its own message.`;
      } else if (slow && elapsed > PLANNER_START_CUTOFF_MS) {
        refusal = `${call.name} takes up to 45 seconds and this turn no longer has that long. Tell her to ask for it as its own message, and do not retry it now.`;
      } else if (admittedThisIteration >= MAX_CALLS_PER_ITERATION) {
        refusal = `Too many tool calls at once — ${MAX_CALLS_PER_ITERATION} is the limit per step. Do the most important ones first and the rest next step.`;
      } else if (this.total >= MAX_CALLS_PER_TURN) {
        refusal = `This turn has already made ${MAX_CALLS_PER_TURN} tool calls. Stop and answer her with what you have.`;
      }

      if (refusal === null) {
        this.seen.add(key);
        this.total += 1;
        admittedThisIteration += 1;
        if (slow) this.planners += 1;
      }
      return { call, refusal };
    });
  }
}

/** Key-sorted, so `{a,b}` and `{b,a}` are the same call. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
