import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { checkLoginAllowed, clientIp } from "@/lib/limits";
import { audit, refusedAddress } from "@/lib/audit";
import { claimable, parseSignup } from "@/lib/signup";

export const runtime = "nodejs";

/**
 * One message for every refusal — uninvited, already claimed, disabled — so
 * the form cannot be used to find out which addresses are on the list.
 */
const REFUSED =
  "That address isn't open for sign-up. Use the email you were invited with — or sign in, if you already have an account.";

/**
 * Claim an invitation.
 *
 * This is a door, so it gets the same lock as sign-in: the per-IP, per-account
 * and global ceilings in lib/limits.ts. It never creates an account — see
 * lib/signup.ts for what it may and may not claim.
 */
export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return Response.json({ error: "Server not configured" }, { status: 503 });

  const parsed = parseSignup(await req.json().catch(() => ({})));
  if (!parsed.ok) return Response.json({ error: parsed.message }, { status: 400 });
  const { email, password, name } = parsed.input;

  const ip = clientIp(req);
  const gate = await checkLoginAllowed(ip, email);
  if (!gate.allowed) {
    await audit("login.rate_limited", { req, detail: { via: "signup" } });
    return Response.json({ error: gate.reason }, { status: 429 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const refusal = claimable(user ?? null);
  if (refusal) {
    // In full, so the console can say which address tried. See refusedAddress.
    const detail = refusal === "not_invited"
      ? { reason: refusal, email: refusedAddress(email) }
      : { reason: refusal, userId: user.id };
    await audit("signup.failure", { req, detail });
    return Response.json({ error: REFUSED }, { status: 403 });
  }

  // Hashed with its own salt — lib/password.ts — and the plaintext goes no
  // further than this stack frame.
  const claimed = await db.update(users)
    .set({
      passwordHash: await hashPassword(password),
      // The invitation may have carried a name already; hers wins over
      // whatever she types now, the same way the Google door adopts one only
      // if we never had it.
      name: user.name ?? name,
      lastLoginAt: new Date(),
    })
    // Conditional, in the query itself: two sign-ups for one address at the
    // same moment must not both succeed, and the check above cannot see the
    // other one. Whichever lands first claims it; the other gets nothing back.
    .where(and(
      eq(users.id, user.id),
      isNull(users.passwordHash),
      isNull(users.googleSub),
      isNull(users.lastLoginAt),
    ))
    .returning({ id: users.id, name: users.name });

  if (claimed.length === 0) {
    await audit("signup.failure", { req, detail: { reason: "already_claimed", userId: user.id } });
    return Response.json({ error: REFUSED }, { status: 403 });
  }

  // Through the cookie store, then redirect from the browser — a
  // Response.redirect() has immutable headers, which is how the Google
  // callback once linked an account and then died before issuing a session.
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(secret, user.id), sessionCookieOptions);
  await audit("signup.success", { req, detail: { userId: user.id } });

  return Response.json({ ok: true, name: claimed[0].name });
}
