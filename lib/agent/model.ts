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
 * USD per million tokens, by model family.
 *
 * Cache writes bill at 1.25x input, cache reads at 0.1x. Pricing the wrong
 * model silently disarms the spend cap that keeps a runaway loop from costing
 * real money: set COACH_MODEL to Opus and bill it at Haiku's rates and the cap
 * allows five times the spend it is supposed to.
 *
 * That is why the table is keyed by model rather than hand-written per role,
 * and why the lookup falls back to the *most* expensive family rather than the
 * cheapest — an unrecognised model should over-charge the ledger and stop
 * early, never under-charge it and run on.
 */
const RATES: Record<string, Pricing> = {
  haiku: { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
  sonnet: { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.2 },
  opus: { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
  fable: { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
};

export function ratesFor(model: string): Pricing {
  const family = Object.keys(RATES).find((f) => model.includes(f));
  // Unknown model: bill it at the top of the range. Over-charging the ledger
  // stops her coach early; under-charging it spends money nobody is watching.
  return RATES[family ?? "opus"];
}

export const PRICING: Pricing = ratesFor(MODEL);
export const PLANNER_PRICING: Pricing = ratesFor(PLANNER_MODEL);

export const pricingFor = (model: string): Pricing =>
  model === PLANNER_MODEL ? PLANNER_PRICING : PRICING;
