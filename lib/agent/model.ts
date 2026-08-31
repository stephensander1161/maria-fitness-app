/**
 * One place to change the model. Haiku 4.5 while we shape behaviour; swap to
 * `claude-opus-5` (or set COACH_MODEL) when it's time for the real thing.
 * Note: Haiku 4.5 predates adaptive thinking and `output_config.effort` —
 * neither is sent here. Both become available on an Opus/Sonnet 5 swap.
 */
export const MODEL = process.env.COACH_MODEL ?? "claude-haiku-4-5";

/** Large enough for create_meal_plan to emit a full week of meals in one tool
 *  call; we stream, so a big ceiling costs nothing when replies are short. */
export const MAX_TOKENS = 16_000;

/** Safety rail on the tool loop — a coaching turn should never need this many. */
export const MAX_TOOL_ITERATIONS = 12;

/**
 * USD per million tokens, for the spend ceiling. These MUST be updated
 * alongside MODEL: pricing the wrong model would silently disarm the cap that
 * keeps a runaway loop from costing real money.
 *
 * Haiku 4.5: $1.00 in / $5.00 out. Cache writes bill at 1.25x input, cache
 * reads at 0.1x. (Opus 5 / Sonnet 5 are $5/$25 and $2/$10 respectively.)
 */
export const PRICING = {
  input: 1.0,
  output: 5.0,
  cacheWrite: 1.25,
  cacheRead: 0.1,
} as const;
