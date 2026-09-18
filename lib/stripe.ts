import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe, over plain HTTP — three calls and a signature check, no SDK.
 *
 * Checkout and the customer portal are Stripe-hosted pages: no card field
 * is ever ours. The webhook is the only writer of what an account is
 * entitled to, and it is believed only when the signature Stripe put on it
 * verifies against the endpoint's secret, within five minutes.
 */
const API = "https://api.stripe.com/v1";

export const stripeConfigured = (): boolean =>
  Boolean(process.env.STRIPE_API_KEY && process.env.STRIPE_PRICE_MONTHLY && process.env.STRIPE_PRICE_YEARLY);

async function call<T>(path: string, form: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_API_KEY;
  if (!key) throw new Error("STRIPE_API_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `stripe ${res.status}`);
  return json;
}

export const priceFor = (plan: "monthly" | "yearly"): string =>
  (plan === "monthly" ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY) ?? "";

/** A hosted checkout for a subscription, with the trial. Returns the page to send her to. */
export async function checkoutUrl(opts: {
  plan: "monthly" | "yearly"; email: string; userId: string; customerId: string | null;
  trialDays: number; successUrl: string; cancelUrl: string;
}): Promise<string> {
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": priceFor(opts.plan),
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    "metadata[userId]": opts.userId,
    "subscription_data[metadata][userId]": opts.userId,
    allow_promotion_codes: "true",
  };
  if (opts.trialDays > 0) form["subscription_data[trial_period_days]"] = String(opts.trialDays);
  if (opts.customerId) form.customer = opts.customerId;
  else form.customer_email = opts.email;
  const s = await call<{ url: string }>("/checkout/sessions", form);
  return s.url;
}

/** The hosted portal: cancel, change plan, update the card, receipts. */
export async function portalUrl(customerId: string, returnUrl: string): Promise<string> {
  const s = await call<{ url: string }>("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  return s.url;
}

/**
 * Stripe's signature: `t=<unix>,v1=<hmac>`; the signed payload is
 * `<t>.<raw body>` under the endpoint secret. Five minutes of tolerance.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) { const i = kv.indexOf("="); if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8"); const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SubscriptionEvent = {
  type: string;
  data: { object: {
    id: string; object: string; customer?: string; status?: string; current_period_end?: number;
    metadata?: Record<string, string>; client_reference_id?: string; subscription?: string;
  } };
};

export type Entitlement = { userId: string | null; customerId: string | null; subscriptionId: string | null; status: string | null; endsAt: Date | null };

/** What an event means for the account: the status to store, or nothing. */
export function entitlementFrom(ev: SubscriptionEvent): Entitlement | null {
  const o = ev.data.object;
  if (ev.type === "checkout.session.completed") {
    return { userId: o.client_reference_id ?? o.metadata?.userId ?? null, customerId: o.customer ?? null, subscriptionId: o.subscription ?? null, status: null, endsAt: null };
  }
  if (ev.type.startsWith("customer.subscription.")) {
    return {
      userId: o.metadata?.userId ?? null, customerId: o.customer ?? null, subscriptionId: o.id,
      status: ev.type === "customer.subscription.deleted" ? "canceled" : (o.status ?? null),
      endsAt: o.current_period_end ? new Date(o.current_period_end * 1000) : null,
    };
  }
  return null;
}
