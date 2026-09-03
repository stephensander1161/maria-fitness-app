/**
 * What the coach costs, expressed as a share of a day rather than as money.
 *
 * Cost in cents is an implementation detail of running the app, and putting it
 * on a screen makes every conversation feel metered — she starts rationing
 * questions to save four cents, which is exactly backwards for a coach she is
 * meant to talk to. It also welds the product's pricing to Anthropic's: the
 * day the model gets cheaper, or this is ever sold for more than it costs to
 * run, the number on the screen is wrong or embarrassing.
 *
 * So micros stay on the server, where the spend gate needs them, and one
 * abstraction crosses every boundary: a percentage of today's allowance. This
 * module is the only place the two meet.
 */

/** Her day, as she and the model see it. */
export type Allowance = {
  /** How much of today's allowance is gone, 0–100. */
  usedPercent: number;
  /** What is left of it, 0–100. */
  remainingPercent: number;
  /** How much of the maximum she has allowed herself, 0–100. */
  capPercent: number;
  /** Messages exchanged today. Not a cost — just a count. */
  requests: number;
};

const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

export function allowanceFrom(spend: {
  costMicros: number;
  limitMicros: number;
  ceilingMicros: number;
  requests: number;
}): Allowance {
  // A limit of zero is "spent", not "nothing used" — dividing by it would
  // otherwise report a full tank on an account that cannot make a single call.
  const used = spend.limitMicros > 0
    ? clampPercent(Math.round((spend.costMicros / spend.limitMicros) * 100))
    : 100;
  const cap = spend.ceilingMicros > 0
    ? clampPercent(Math.round((spend.limitMicros / spend.ceilingMicros) * 100))
    : 100;
  return {
    usedPercent: used,
    remainingPercent: 100 - used,
    capPercent: cap,
    requests: spend.requests,
  };
}

/** A share of the deployment's maximum, back into the units the gate uses. */
export function microsForPercent(percent: number, ceilingMicros: number): number {
  return Math.round((clampPercent(percent) / 100) * ceilingMicros);
}
