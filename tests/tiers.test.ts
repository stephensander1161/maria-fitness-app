import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { createHmac } from "node:crypto";
import { TIERS, tierCeilingMicros, tierOf } from "@/lib/tiers";
import { PRO_ONLY } from "@/lib/tier-messages";
import { entitlementFrom, verifyStripeSignature } from "@/lib/stripe";
const read = (p: string) => fs.readFileSync(p, "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = `${dir}/${e.name}`; if (e.isDirectory()) walk(f, out); else if (/\.tsx?$/.test(f)) out.push(f);
  }
  return out;
};

suite("free and Pro — 2026-09-18", () => {
  /*
    "Do Stripe." Two tiers: free is the trial that never ends, with a small
    coach; Pro is everything on. Entitlement is what Stripe says or a comped
    flag an owner set — never what the browser claims.
  */
  it("is what Stripe says, or comped, and nothing the browser can claim", () => {
    expect(tierOf(null)).toBe("free");
    expect(tierOf({ comped: false, subscriptionStatus: null })).toBe("free");
    for (const s of ["active", "trialing", "past_due"]) expect(tierOf({ comped: false, subscriptionStatus: s }), s).toBe("pro");
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired"]) expect(tierOf({ comped: false, subscriptionStatus: s }), s).toBe("free");
    expect(tierOf({ comped: true, subscriptionStatus: "canceled" })).toBe("pro");
  });

  it("a free day is small, a paid day is what the price affords, a comped day is the deployment's", () => {
    // Measured 2026-09-18: 23¢ per founder person-day, 45¢ at most.
    expect(TIERS.free.dailyCostMicros).toBe(50_000);
    expect(TIERS.pro.dailyCostMicros).toBe(200_000);
    expect(TIERS.free.coachTurnsPerDay).toBe(5);
    expect(tierCeilingMicros({ comped: true, subscriptionStatus: null })).toBe(Infinity);
    expect(tierCeilingMicros({ comped: false, subscriptionStatus: "active" })).toBe(200_000);
    expect(tierCeilingMicros(null)).toBe(50_000);
  });

  it("every Pro door is a tagged tool, checked once in runTool, or the estimator's own line", () => {
    const tagged = Object.fromEntries(walk("lib/tools").flatMap((f) =>
      [...read(f).matchAll(/name: "([a-z_]+)",\n\s+requires: "([a-z]+)"/g)].map((m) => [m[1], m[2]])));
    expect(tagged).toMatchObject({
      create_weekly_plan: "planner", create_meal_plan: "planner",
      get_shopping_list: "kitchen", send_shopping_list_to_instacart: "kitchen", get_pantry: "kitchen",
      log_cook_session: "kitchen", estimate_recipe_from_photo: "camera", add_progress_photo: "camera",
    });
    expect(read("lib/tools/index.ts")).toMatch(/if \(tool\.requires && ctx\.tier === "free"\)/);
    expect(read("lib/tools/foods.ts")).toMatch(/if \(ctx\.tier === "free"\)[\s\S]{0,200}PRO_ONLY\.estimator/);
    // Every message is one sentence of help, not a sales pitch.
    for (const m of Object.values(PRO_ONLY)) expect(m).toMatch(/Pro/);
  });

  it("the two doors set the tier; internal callers never do", () => {
    expect(read("app/api/action/route.ts")).toMatch(/tier: tierOf\(user\)/);
    expect(read("app/api/chat/route.ts")).toMatch(/tier: tierOf\(user\)/);
    expect(read("lib/agent/loop.ts")).toMatch(/tier: opts\.tier/);
    expect(read("lib/agent/loop.ts")).toMatch(/opts\.tier === "free" && await turnsToday/);
    for (const f of ["app/api/onboard/route.ts", "lib/reminders.ts", "lib/owner-alert.ts"]) expect(read(f), f).not.toMatch(/tier:/);
    // And no tool module reads the accounts table to find out for itself.
    for (const f of walk("lib/tools")) expect(read(f), f).not.toMatch(/lib\/tiers"/);
  });

  it("the daily allowance reads the tier first", () => {
    expect(read("lib/limits.ts")).toMatch(/Math\.min\(LIMITS\.dailyCostMicros, tierCeilingMicros\(await entitledFor\(profileId\)\)\)/);
  });
});

suite("Stripe, believed only on its signature", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1","type":"customer.subscription.updated","data":{"object":{"id":"sub_1","object":"subscription","customer":"cus_1","status":"active","current_period_end":1800000000,"metadata":{"userId":"u1"}}}}';
  const sign = (t: number, b = body, s = secret) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${b}`).digest("hex")}`;

  it("verifies a fresh, correctly signed body and nothing else", () => {
    const now = 1_760_000_000_000;
    expect(verifyStripeSignature(body, sign(now / 1000), secret, now)).toBe(true);
    expect(verifyStripeSignature(body, sign(now / 1000, body, "whsec_other"), secret, now)).toBe(false);
    expect(verifyStripeSignature(body + " ", sign(now / 1000), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(now / 1000 - 600), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", secret, now)).toBe(false);
  });

  it("turns an event into what the account is entitled to", () => {
    const ev = JSON.parse(body);
    expect(entitlementFrom(ev)).toEqual({ userId: "u1", customerId: "cus_1", subscriptionId: "sub_1", status: "active", endsAt: new Date(1800000000 * 1000) });
    expect(entitlementFrom({ ...ev, type: "customer.subscription.deleted" })?.status).toBe("canceled");
    expect(entitlementFrom({ type: "checkout.session.completed", data: { object: { id: "cs_1", object: "checkout.session", customer: "cus_1", subscription: "sub_1", client_reference_id: "u1" } } }))
      .toMatchObject({ userId: "u1", customerId: "cus_1", subscriptionId: "sub_1", status: null });
    expect(entitlementFrom({ type: "invoice.paid", data: { object: { id: "in_1", object: "invoice" } } })).toBeNull();
  });

  it("the webhook is the only writer, public, and the card never holds a card", () => {
    const hook = read("app/api/billing/webhook/route.ts");
    expect(hook).toMatch(/verifyStripeSignature\(raw, req\.headers\.get\("stripe-signature"\), secret\)/);
    expect(hook).toMatch(/db\.update\(users\)/);
    expect(read("proxy.ts")).toContain('"/api/billing/webhook",');
    for (const f of ["app/api/billing/checkout/route.ts", "app/api/billing/portal/route.ts"]) expect(read(f), f).not.toMatch(/db\.(insert|update|delete)/);
    const card = read("components/go-pro.tsx");
    expect(card).toMatch(/window\.location\.assign\(data\.url\)/);
    expect(card).not.toMatch(/card_number|cvc|expiry/i);
    // A browser file must not import the tier module, which reads the database.
    expect(card).not.toMatch(/from "@\/lib\/tiers"/);
    expect(read("app/settings/page.tsx")).toMatch(/<GoPro tier=\{tierOf\(account\)\}/);
  });
});
