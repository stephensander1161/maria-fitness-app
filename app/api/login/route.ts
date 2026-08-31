import { cookies } from "next/headers";
import {
  createSessionToken, passphraseMatches, SESSION_COOKIE, sessionCookieOptions,
} from "@/lib/auth";
import { checkLoginAllowed, clientIp, recordLoginAttempt } from "@/lib/limits";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  const expected = process.env.APP_PASSPHRASE;
  if (!secret || !expected) {
    return Response.json({ error: "Server not configured" }, { status: 503 });
  }

  const ip = clientIp(req);
  const gate = await checkLoginAllowed(ip);
  if (!gate.allowed) return Response.json({ error: gate.reason }, { status: 429 });

  // Every attempt is recorded before the check, so a flood of wrong guesses
  // burns the budget whether or not any of them land.
  await recordLoginAttempt(ip);

  const body = (await req.json().catch(() => ({}))) as { passphrase?: unknown };
  const attempt = typeof body.passphrase === "string" ? body.passphrase.slice(0, 200) : "";

  if (!(await passphraseMatches(attempt, expected, secret))) {
    // Deliberately vague, and no timing signal — the comparison is over HMACs.
    return Response.json({ error: "That's not it." }, { status: 401 });
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(secret), sessionCookieOptions);
  return Response.json({ ok: true });
}

/** Sign out — clears the cookie. */
export async function DELETE() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return Response.json({ ok: true });
}
