import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { exchangeCode, statesMatch, type Pending } from "@/lib/oauth";
import { audit } from "@/lib/audit";
import { checkLoginAllowed, clientIp, recordLoginAttempt } from "@/lib/limits";

export const runtime = "nodejs";

const FLOW_COOKIE = "coach_oauth";

const back = (req: Request, error: string) =>
  Response.redirect(new URL(`/login?error=${error}`, req.url), 302);

export async function GET(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return back(req, "unavailable");

  const store = await cookies();
  const raw = store.get(FLOW_COOKIE)?.value;
  store.set(FLOW_COOKIE, "", { path: "/", maxAge: 0 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // She declined at Google's screen, or Google refused.
  if (url.searchParams.get("error")) return back(req, "cancelled");
  if (!raw || !code || !state) return back(req, "expired");

  let pending: Pending;
  try {
    pending = JSON.parse(raw) as Pending;
  } catch {
    return back(req, "expired");
  }
  // The state ties this callback to the browser that started the flow.
  if (!statesMatch(state, pending.state)) {
    await audit("login.failure", { req, detail: { reason: "oauth_state_mismatch" } });
    return back(req, "expired");
  }

  const ip = clientIp(req);
  const gate = await checkLoginAllowed(ip);
  if (!gate.allowed) {
    await audit("login.rate_limited", { req });
    return back(req, "rate_limited");
  }
  await recordLoginAttempt(ip);

  let identity;
  try {
    identity = await exchangeCode(req, code, pending.verifier);
  } catch (err) {
    console.error("[oauth]", err);
    await audit("login.failure", { req, detail: { reason: "oauth_exchange_failed" } });
    return back(req, "failed");
  }

  // Match on Google's subject first: it survives an address change, where email
  // would quietly create a second account.
  const [bySub] = identity.sub
    ? await db.select().from(users).where(eq(users.googleSub, identity.sub)).limit(1)
    : [];
  const [byEmail] = bySub
    ? []
    : await db.select().from(users).where(eq(users.email, identity.email)).limit(1);
  const user = bySub ?? byEmail;

  // Invite-only. Google proving who someone is does not entitle them to an
  // account — without this, anyone with a Google account could sign up and
  // start spending the API key.
  if (!user) {
    await audit("login.failure", { req, detail: { reason: "not_invited", email: identity.email } });
    return back(req, "not_invited");
  }
  if (user.disabledAt) {
    await audit("login.failure", { req, detail: { reason: "disabled", userId: user.id } });
    return back(req, "disabled");
  }

  // Link on first Google sign-in, and adopt the name if we never had one.
  await db.update(users).set({
    googleSub: identity.sub,
    name: user.name ?? identity.name,
    lastLoginAt: new Date(),
  }).where(eq(users.id, user.id));

  const session = await createSessionToken(secret, user.id);
  const response = Response.redirect(new URL("/", req.url), 302);
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${session}; Path=/; Max-Age=${sessionCookieOptions.maxAge}; HttpOnly; SameSite=Lax${
      sessionCookieOptions.secure ? "; Secure" : ""
    }`,
  );

  await audit("login.success", { req, detail: { userId: user.id, via: "google" } });
  return response;
}
