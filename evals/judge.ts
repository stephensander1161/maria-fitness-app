import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

/**
 * The soft half of the harness.
 *
 * Tool calls and database rows are checked exactly (see harness.ts). Prose
 * cannot be: asserting on substrings of model output produces tests that fail
 * when the coach rephrases and pass when it lies politely. So a second, cheap
 * model grades one narrow question at a time.
 *
 * Two rules keep the judge trustworthy:
 *   1. One criterion per call, phrased so a careful reader would answer the
 *      same way twice — "does the reply say plainly that the squat was down?",
 *      never "is this a good reply?".
 *   2. The verdict comes back through a forced tool call, so the result is a
 *      boolean, not prose we then have to parse.
 */

/** Deliberately fixed, and deliberately not COACH_MODEL: the judge must not
 *  change when the model under test does, or a swap silently regrades history. */
export const JUDGE_MODEL = "claude-haiku-4-5";

/** USD per million tokens for JUDGE_MODEL (Haiku 4.5). Kept here rather than
 *  reusing lib/agent/model.ts PRICING, which tracks the *coach* model. */
const JUDGE_PRICING = { input: 1.0, output: 5.0 } as const;

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const spend = { inputTokens: 0, outputTokens: 0, costMicros: 0, calls: 0 };

/** Judge spend is tracked in-process: it is the harness's cost, not the app's,
 *  so it deliberately never reaches the usage_daily ledger. */
export const judgeUsage = () => ({ ...spend });

export type Verdict = { pass: boolean; reason: string };

const verdictTool: Anthropic.Tool = {
  name: "verdict",
  description: "Record your verdict on the single criterion you were given.",
  input_schema: {
    type: "object",
    properties: {
      pass: {
        type: "boolean",
        description: "true only if the criterion is clearly satisfied by the reply",
      },
      reason: {
        type: "string",
        description:
          "One short sentence naming the decisive part of the reply. No preamble.",
      },
    },
    required: ["pass", "reason"],
    additionalProperties: false,
  },
};

const SYSTEM = `You grade a single reply from a fitness coaching assistant against exactly ONE criterion.

Rules:
- Judge only the criterion given. Ignore tone, length, formatting, and anything else you might have an opinion about.
- Judge only what the reply actually says. Do not reward intentions or give benefit of the doubt.
- If the criterion is not clearly satisfied, the verdict is fail.
- Answer by calling the verdict tool. Nothing else.`;

export async function judge(opts: {
  /** The exact question being graded, phrased so the answer is yes or no. */
  criterion: string;
  /** The coach's reply, verbatim. */
  reply: string;
  /** Ground truth the grader needs, e.g. what the database actually holds. */
  context?: string;
}): Promise<Verdict> {
  const prompt = [
    opts.context ? `Ground truth (what is actually true):\n${opts.context}\n` : "",
    `The assistant's reply:\n<reply>\n${opts.reply}\n</reply>\n`,
    `Criterion: ${opts.criterion}`,
    `Call verdict with pass=true only if the criterion is clearly satisfied.`,
  ]
    .filter(Boolean)
    .join("\n");

  const message = await withRetry(() =>
    client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 300,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      tools: [verdictTool],
      tool_choice: { type: "tool", name: "verdict" },
    }),
  );

  spend.calls += 1;
  spend.inputTokens += message.usage.input_tokens ?? 0;
  spend.outputTokens += message.usage.output_tokens ?? 0;
  spend.costMicros += Math.round(
    (message.usage.input_tokens ?? 0) * JUDGE_PRICING.input +
      (message.usage.output_tokens ?? 0) * JUDGE_PRICING.output,
  );

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  const input = block?.input as { pass?: unknown; reason?: unknown } | undefined;
  if (typeof input?.pass !== "boolean") {
    // A judge that cannot answer is a failed check, not a passed one.
    return { pass: false, reason: "judge returned no usable verdict" };
  }
  return {
    pass: input.pass,
    reason: typeof input.reason === "string" ? input.reason : "(no reason given)",
  };
}

/** One retry: a 429 or a blip should not read as a behavioural regression. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Anthropic.APIError && (err.status === 429 || (err.status ?? 0) >= 500)) {
      await new Promise((r) => setTimeout(r, 2_000));
      return fn();
    }
    throw err;
  }
}
