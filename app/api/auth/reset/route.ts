import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailTokens, users } from "@/lib/db/schema";
import { audit, refusedAddress } from "@/lib/audit";
import { checkResetAllowed, clientIp } from "@/lib/limits";
import { linkMail, sendEmail } from "@/lib/email";
import { linkFor, newToken, tokenHash, ttlFor } from "@/lib/reset";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const SAME = { ok: true, message: "If that address has an account, a link is on its way. Check spam if it takes more than a minute." };

/**
 * "Forgot your password?" — see lib/reset.ts.
 *
 * Answers the same for every address, and does its work only for one that
 * has an account with a password door: an invitation never claimed gets an
 * invitation link instead, so the person who was invited and has forgotten
 * that fact still ends up inside.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  if (!email.includes("@")) return Response.json({ error: "That doesn't look like an email address." }, { status: 400 });

  const gate = await checkResetAllowed(clientIp(req), email);
  if (!gate.allowed) {
    await audit("login.rate_limited", { req, detail: { door: "reset" } });
    return Response.json({ error: gate.reason }, { status: 429 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  await audit("reset.requested", { req, detail: { email: refusedAddress(email), known: Boolean(user && !user.disabledAt) } });
  if (!user || user.disabledAt) return Response.json(SAME);

  const kind = user.passwordHash || user.googleSub || user.lastLoginAt ? "reset" : "invite";
  const token = newToken();
  // The newest link is the one that works.
  await db.update(emailTokens).set({ usedAt: new Date() })
    .where(and(eq(emailTokens.userId, user.id), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt)));
  await db.insert(emailTokens).values({
    userId: user.id, kind, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + ttlFor(kind)),
  });

  const origin = env.APP_URL ?? new URL(req.url).origin;
  const url = linkFor(kind, token, origin);
  const mail = kind === "reset"
    ? linkMail(email, "Reset your Sore Winner password",
        ["Someone asked to reset the password for this address. If that was you, choose a new one here — the link works once, for an hour."],
        url, "Choose a new password")
    : linkMail(email, "You're invited to Sore Winner",
        ["You've been invited. Set up your account here — the link works for a week."],
        url, "Set up your account");
  await sendEmail(mail);
  return Response.json(SAME);
}
