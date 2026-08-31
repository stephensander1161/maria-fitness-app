/**
 * Two models, chosen by job.
 *
 * Conversation is frequent, short, and well within Haiku's reach — it reads
 * tool results and talks to her. Plan generation is the opposite: rare, long,
 * highly structured, and the place every observed failure lived (invented
 * exercise slugs, meal plans landing 200 kcal/day under target, a runaway tool
 * loop that burned 86 seconds). So planning gets a stronger model, and because
 * it happens roughly weekly it barely moves the daily average.
 */
export const MODEL = process.env.COACH_MODEL ?? "claude-haiku-4-5";
export const PLANNER_MODEL = process.env.PLANNER_MODEL ?? "claude-sonnet-5";

/** Large enough for a full week of meals in one structured response. */
export const MAX_TOKENS = 16_000;

/** Safety rail on the tool loop — a coaching turn should never need this many. */
export const MAX_TOOL_ITERATIONS = 12;

export type Pricing = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

/**
 * USD per million tokens. These MUST be updated alongside the model ids above:
 * pricing the wrong model silently disarms the spend cap that keeps a runaway
 * loop from costing real money. tests/limits.test.ts asserts the pairing.
 *
 * Haiku 4.5: $1 / $5.   Sonnet 5: $2 / $10.   (Opus 5 would be $5 / $25.)
 * Cache writes bill at 1.25x input, cache reads at 0.1x.
 */
export const PRICING: Pricing = {
  input: 1.0,
  output: 5.0,
  cacheWrite: 1.25,
  cacheRead: 0.1,
};

export const PLANNER_PRICING: Pricing = {
  input: 2.0,
  output: 10.0,
  cacheWrite: 2.5,
  cacheRead: 0.2,
};

export const pricingFor = (model: string): Pricing =>
  model === PLANNER_MODEL ? PLANNER_PRICING : PRICING;
