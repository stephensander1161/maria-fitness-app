import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { entitlementFrom, verifyStripeSignature, type SubscriptionEvent } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * The only writer of what an account is entitled to — see lib/tiers.ts.
 *
 * Public in proxy.ts because Stripe has no session; believed only when the
 * signature verifies. Idempotent: every event carries the whole state, so a
 * replay writes the same row. Answers 200 to anything it understood and
 * does not care about, so Stripe stops retrying it.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) {
    await audit("billing.webhook_refused", { req });
    return Response.json({ error: "bad signature" }, { status: 400 });
  }
  const ev = JSON.parse(raw) as SubscriptionEvent;
  const e = entitlementFrom(ev);
  if (!e) return Response.json({ ok: true, ignored: ev.type });

  // Find the account: by our id when the event carries it, else by customer.
  const [user] = e.userId
    ? await db.select().from(users).where(eq(users.id, e.userId)).limit(1)
    : e.customerId
      ? await db.select().from(users).where(eq(users.stripeCustomerId, e.customerId)).limit(1)
      : [];
  if (!user) {
    await audit("billing.webhook_unmatched", { req, detail: { type: ev.type } });
    return Response.json({ ok: true, unmatched: true });
  }
  await db.update(users).set({
    ...(e.customerId ? { stripeCustomerId: e.customerId } : {}),
    ...(e.subscriptionId ? { stripeSubscriptionId: e.subscriptionId } : {}),
    ...(e.status ? { subscriptionStatus: e.status } : {}),
    ...(e.endsAt ? { subscriptionEndsAt: e.endsAt } : {}),
  }).where(eq(users.id, user.id));
  await audit("billing.updated", { req, detail: { userId: user.id, type: ev.type, status: e.status } });
  return Response.json({ ok: true });
}
