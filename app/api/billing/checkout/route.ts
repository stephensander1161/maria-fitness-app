import { currentUser } from "@/lib/session";
import { checkoutUrl, stripeConfigured } from "@/lib/stripe";
import { PRO_PRICE, tierOf } from "@/lib/tiers";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Go Pro: hands her to Stripe's page. Nothing here is written; the webhook does that. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!stripeConfigured()) return Response.json({ error: "Subscriptions aren't switched on yet." }, { status: 503 });
  if (tierOf(user) === "pro") return Response.json({ error: "You're already on Pro." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { plan?: unknown };
  const plan = body.plan === "yearly" ? "yearly" : "monthly";
  const origin = env.APP_URL ?? new URL(req.url).origin;
  const url = await checkoutUrl({
    plan, email: user.email, userId: user.id, customerId: user.stripeCustomerId,
    // One trial per account: a second subscription after a cancellation starts paid.
    trialDays: user.subscriptionStatus ? 0 : PRO_PRICE.trialDays,
    successUrl: `${origin}/settings?pro=welcome`, cancelUrl: `${origin}/settings`,
  });
  await audit("billing.checkout_started", { req, detail: { userId: user.id, plan } });
  return Response.json({ url });
}
