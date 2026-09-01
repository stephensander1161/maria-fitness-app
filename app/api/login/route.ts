import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";
import { checkLoginAllowed, clientIp, recordLoginAttempt } from "@/lib/limits";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * A dummy hash with the real parameters. Verifying against it when the email is
 * unknown makes a missing account cost the same ~200ms as a wrong password, so
 * response time doesn't reveal which addresses exist.
 */
const DUMMY_HASH =
  "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return Response.json({ error: "Server not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 400) : "";

  const ip = clientIp(req);
  const gate = await checkLoginAllowed(ip, email);
  if (!gate.allowed) {
    await audit("login.rate_limited", { req });
    return Response.json({ error: gate.reason }, { status: 429 });
  }

  // Recorded before the check, so a flood of wrong guesses burns the budget
  // whether or not any of them land.
  await recordLoginAttempt(ip, email);

  const [user] = email
    ? await db.select().from(users).where(eq(users.email, email)).limit(1)
    : [];

  // An invited account that has only ever used Google has no password hash.
  // It still burns the same work, so "no password set" is indistinguishable
  // from "wrong password" and from "no such account".
  const ok = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : (await verifyPassword(password, DUMMY_HASH), false);

  if (!ok || !user || user.disabledAt) {
    // The attempt itself is never logged — a record of near-misses is a wordlist.
    await audit("login.failure", {
      req,
      detail: {
        reason: !user
          ? "unknown_email"
          : user.disabledAt
            ? "disabled"
            : !user.passwordHash
              ? "no_password_set"
              : "bad_password",
      },
    });
    // Deliberately identical for every failure mode.
    return Response.json({ error: "That's not right." }, { status: 401 });
  }

  // Transparently upgrade a hash made with weaker parameters, now we have the
  // plaintext in hand and know it is correct.
  if (user.passwordHash && needsRehash(user.passwordHash)) {
    await db.update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, user.id));
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(secret, user.id), sessionCookieOptions);
  await audit("login.success", { req, detail: { userId: user.id } });

  return Response.json({ ok: true, name: user.name });
}

/** Sign out on this device — clears the cookie only. */
export async function DELETE(req: Request) {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  await audit("logout", { req });
  return Response.json({ ok: true });
}
