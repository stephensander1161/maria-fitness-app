import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export type ToolContext = { profileId: string };

export type Tool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  input: S;
  /**
   * Set this ONLY when the model physically cannot perform the action, and set
   * it to the reason why. Hiding a tool narrows what she can delegate to the
   * coach, so it needs a justification stronger than "the UI does it" — that is
   * true of nearly every tool here.
   *
   * It does not weaken the one-write-path rule: the handler still runs through
   * the same registry, with the same validation and the same server-supplied
   * profileId. It only removes the tool from the model's tool list.
   */
  uiOnly?: string;
  /** Handlers are plain async functions — the UI calls them directly, and so
   *  does the agent loop. One implementation, two callers, no drift. */
  handler: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
};

export function defineTool<S extends z.ZodType>(tool: Tool<S>): Tool<S> {
  return tool;
}

/** Zod's integer bounds are JS_MAX_SAFE_INTEGER; they carry no meaning for the
 *  model and cost tokens on every single request. Strip them. */
function prune(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(prune);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "$schema") continue;
      if ((k === "maximum" || k === "minimum") && Math.abs(v as number) === Number.MAX_SAFE_INTEGER) continue;
      out[k] = prune(v);
    }
    return out;
  }
  return node;
}

export function toAnthropicTool(tool: Tool): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: prune(
      z.toJSONSchema(tool.input, { target: "draft-7", io: "input" }),
    ) as Anthropic.Tool.InputSchema,
  };
}
