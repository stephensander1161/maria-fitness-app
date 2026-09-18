import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailTokens, users } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_RULE } from "@/lib/signup";
import { parseToken, refusal, tokenHash } from "@/lib/reset";

export const runtime = "nodejs";

/**
 * The new password, with the link as proof — see lib/reset.ts.
 *
 * Every other session for the account ends: a reset is most often "my phone
 * is gone", and the phone that is gone is signed in. This one is signed in
 * fresh, so she lands on the app rather than on the sign-in screen she was
 * locked out of a minute ago.
 */
export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return Response.json({ error: "Server not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  const token = parseToken(body.token);
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) return Response.json({ error: "That link isn't right. Ask for a new one." }, { status: 400 });
  if (password.length < MIN_PASSWORD_LENGTH) return Response.json({ error: PASSWORD_RULE }, { status: 400 });
  if (password.length > MAX_PASSWORD_LENGTH) return Response.json({ error: `Keep it under ${MAX_PASSWORD_LENGTH} characters.` }, { status: 400 });

  const [row] = await db.select().from(emailTokens).where(eq(emailTokens.tokenHash, tokenHash(token))).limit(1);
  const why = refusal(row ?? null, "reset");
  if (why) {
    await audit("reset.refused", { req, detail: { reason: why } });
    return Response.json({
      error: why === "expired" ? "That link has expired. Ask for a new one." : "That link has already been used, or isn't right. Ask for a new one.",
    }, { status: 400 });
  }
  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || user.disabledAt) {
    await audit("reset.refused", { req, detail: { reason: "no_account" } });
    return Response.json({ error: "That link isn't right. Ask for a new one." }, { status: 400 });
  }

  const now = new Date();
  await db.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, row.id));
  await db.update(users)
    .set({ passwordHash: await hashPassword(password), sessionsValidFrom: now, lastLoginAt: now })
    .where(eq(users.id, user.id));
  await audit("reset.done", { req, detail: { userId: user.id } });

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(secret, user.id), sessionCookieOptions);
  return Response.json({ ok: true });
}
