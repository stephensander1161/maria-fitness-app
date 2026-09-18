import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailTokens, users } from "@/lib/db/schema";
import { POST as request } from "@/app/api/auth/reset/route";
import { hashPassword } from "@/lib/password";
import { refusal } from "@/lib/reset";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * The emailed door against a real database — see lib/reset.ts. No email is
 * sent here (no key in .env.test), which is the point: what the route writes
 * is what is being checked, and the mail is only the delivery.
 */
const post = (email: string, ip = "203.0.113.7") =>
  request(new Request("http://test/api/auth/reset", {
    method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": ip }, body: JSON.stringify({ email }),
  }));

suite("the emailed door", () => {
  let a: TestAccount;
  let email: string;
  beforeAll(async () => {
    a = await makeAccount("reset");
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, a.userId)).limit(1);
    email = u.email;
    // A claimed account: it has a password, so it gets a reset, not an invite.
    await db.update(users).set({ passwordHash: await hashPassword("a-perfectly-good-password") }).where(eq(users.id, a.userId));
  });
  afterAll(async () => { await dropAccount(a); });

  it("answers the same sentence for a stranger and for her", async () => {
    const stranger = await post("nobody-here-dbtest@probe.invalid");
    const hers = await post(email);
    expect(stranger.status).toBe(200);
    expect(await stranger.json()).toEqual(await hers.json());
    // …and wrote nothing for the stranger.
    const rows = await db.select().from(emailTokens);
    expect(rows.filter((r) => r.userId === a.userId)).toHaveLength(1);
  });

  it("stores a hash that is usable once, for an hour, and cancels the one before", async () => {
    const [first] = await db.select().from(emailTokens).where(and(eq(emailTokens.userId, a.userId), eq(emailTokens.kind, "reset")));
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.expiresAt.getTime() - first.createdAt.getTime()).toBeGreaterThan(59 * 60 * 1000);
    expect(refusal(first, "reset")).toBeNull();
    await post(email);
    const rows = await db.select().from(emailTokens).where(and(eq(emailTokens.userId, a.userId), eq(emailTokens.kind, "reset")));
    expect(rows).toHaveLength(2);
    const stale = rows.find((r) => r.id === first.id)!;
    expect(refusal(stale, "reset")).toBe("used");
    expect(rows.filter((r) => refusal(r, "reset") === null)).toHaveLength(1);
  });

  it("sends an invitation, not a reset, to an address that was invited and never claimed", async () => {
    await db.update(users).set({ passwordHash: null, googleSub: null, lastLoginAt: null }).where(eq(users.id, a.userId));
    await post(email);
    const invites = await db.select().from(emailTokens).where(and(eq(emailTokens.userId, a.userId), eq(emailTokens.kind, "invite")));
    expect(invites).toHaveLength(1);
    expect(invites[0].expiresAt.getTime() - invites[0].createdAt.getTime()).toBeGreaterThan(6 * 24 * 3600 * 1000);
  });

  it("is rate limited per address, harder than sign-in", async () => {
    // Three an hour per address; the three above used them.
    const res = await post(email, "198.51.100.9");
    expect(res.status).toBe(429);
  });
});
