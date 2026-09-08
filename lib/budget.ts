/**
 * Turning a sum of money into a per-person daily cap.
 *
 * `profiles.daily_budget_micros` may only ever *tighten* the deployment's
 * ceiling (`DAILY_COST_LIMIT_MICROS`), never lift it — that is the invariant
 * behind set_coach_budget, and the reason it takes a percentage rather than
 * an amount: there is no number a session can send that means "more". This
 * is the same rule for the owner's command line, where a real amount is the
 * natural thing to type, so the refusal has to say what to do instead.
 *
 * Pure, and tested, because the failure it prevents is silent: a budget set
 * above the ceiling would appear to work, show the number back, and cap her
 * at the old figure anyway.
 */
export const MICROS_PER_DOLLAR = 1_000_000;

export const dollars = (micros: number): string => `$${(micros / MICROS_PER_DOLLAR).toFixed(2)}`;

export type BudgetChoice =
  | { ok: true; micros: number | null; note: string }
  | { ok: false; error: string };

/**
 * `amount` as typed: a sum in dollars, or "none" for the full ceiling.
 * `ceiling` is the deployment's own cap, in micros.
 */
export function budgetFor(amount: string, ceiling: number): BudgetChoice {
  const said = amount.trim().toLowerCase();
  if (said === "none" || said === "full" || said === "default") {
    return { ok: true, micros: null, note: `the full ceiling (${dollars(ceiling)}/day)` };
  }

  // Empty is not zero. `Number("")` is 0 — finite and non-negative — so
  // without this an empty argument silently sets the budget to nothing and
  // turns her coach off. The same trap `num()` in lib/limits.ts documents.
  const cleaned = said.replace(/^\$/, "").trim();
  const parsed = cleaned === "" ? NaN : Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: `"${amount}" is not an amount. Give dollars a day — 2, 0.50 — or "none".` };
  }

  const micros = Math.round(parsed * MICROS_PER_DOLLAR);
  if (micros > ceiling) {
    // The honest refusal: a per-person budget cannot lift the deployment's
    // cap, so the fix is the environment variable, not this command.
    return {
      ok: false,
      error:
        `${dollars(micros)}/day is above this deployment's ceiling of ${dollars(ceiling)}/day, and a ` +
        `per-person budget can only tighten it. Raise DAILY_COST_LIMIT_MICROS to at least ${micros} ` +
        `and redeploy, then set this again — and set everyone else's budget first, or raising the ` +
        `ceiling raises it for all of them.`,
    };
  }
  return { ok: true, micros, note: `${dollars(micros)}/day` };
}
