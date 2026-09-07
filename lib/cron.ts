/**
 * The guard on every scheduled route.
 *
 * Vercel's scheduler calls a cron path with `Authorization: Bearer
 * $CRON_SECRET`. The proxy lets those paths through without a session — it
 * has to, the scheduler has none — so this is the whole gate. Two refusals,
 * in this order:
 *
 * - No secret configured: 503, not open. A trigger anyone on the internet can
 *   pull is worse than a job that never runs, and the production environment
 *   ran for months without one, which is how the reminder never sent.
 * - Wrong or missing bearer: 401.
 *
 * Returns the refusal to send, or null to proceed.
 */
export function cronRefusal(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "No CRON_SECRET configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
