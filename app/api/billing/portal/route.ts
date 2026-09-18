import { currentUser } from "@/lib/session";
import { portalUrl, stripeConfigured } from "@/lib/stripe";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Manage the subscription — cancel, change plan, card, receipts — on Stripe's page. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!stripeConfigured() || !user.stripeCustomerId) return Response.json({ error: "Nothing to manage yet." }, { status: 400 });
  const origin = env.APP_URL ?? new URL(req.url).origin;
  return Response.json({ url: await portalUrl(user.stripeCustomerId, `${origin}/settings`) });
}
