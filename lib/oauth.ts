import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Google sign-in, used purely as an identity provider.
 *
 * The flow only ever answers one question: does this person control this email
 * address? Everything after that — the session, revocation, the audit trail —
 * stays in this app's own hands. That is why there is no auth library here: the
 * part worth outsourcing is identity, not sessions.
 *
 * Access is invite-only. Google proving who someone is does not entitle them to
 * an account, and an open door here would mean strangers spending the API key.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Derived from the request so localhost and production both work unmodified. */
export function redirectUri(req: Request): string {
  const url = new URL(req.url);
  // Behind Vercel's proxy the internal protocol is http; trust the forwarded one.
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

const b64url = (b: Buffer) => b.toString("base64url");

export type Pending = { state: string; verifier: string };

/** One-time values tying the callback to the browser that started the flow. */
export function beginFlow(): Pending {
  return { state: b64url(randomBytes(24)), verifier: b64url(randomBytes(32)) };
}

export function authorizeUrl(req: Request, pending: Pending): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state: pending.state,
    // PKCE. Belt and braces alongside the client secret, and it costs nothing.
    code_challenge: b64url(createHash("sha256").update(pending.verifier).digest()),
    code_challenge_method: "S256",
    // Ask Google to show the picker rather than silently reusing one account.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export function statesMatch(a: string, b: string): boolean {
  // Two empty strings are equal, and that is exactly the case this must not
  // accept: a missing cookie and a missing query parameter would otherwise
  // "match" and wave the callback through. The route checks for both before
  // calling this, but a comparison used as a security check should not depend
  // on its callers remembering to.
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type GoogleIdentity = { sub: string; email: string; name: string | null };

/**
 * Exchange the code and read the identity out of the id_token.
 *
 * The token comes straight from Google's endpoint over TLS, authenticated with
 * our client secret, so the signature does not need re-verifying — but `aud`,
 * `iss` and `email_verified` are checked regardless. An unverified email is the
 * one that matters: without that check, anyone could claim an address they do
 * not own.
 */
export async function exchangeCode(
  req: Request,
  code: string,
  verifier: string,
): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });

  if (!res.ok) throw new Error(`Google rejected the code exchange (${res.status})`);

  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google returned no id_token");

  return identityFrom(id_token, process.env.GOOGLE_CLIENT_ID);
}

export type IdTokenClaims = {
  sub?: string; email?: string; email_verified?: boolean | string;
  name?: string; aud?: string; iss?: string; exp?: number;
};

/**
 * The claim checks, pulled out so they can be tested without a network.
 *
 * The token arrived over TLS from Google's token endpoint, authenticated with
 * our client secret, so the signature does not need re-verifying. Everything
 * else does: an `aud` for a different client is a token minted for someone
 * else's app, and an unverified email is the whole attack — anyone can put an
 * address they do not own into an unverified profile.
 */
export function identityFrom(idToken: string, expectedAudience: string | undefined): GoogleIdentity {
  let payload: IdTokenClaims;
  try {
    payload = JSON.parse(
      Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as IdTokenClaims;
  } catch {
    throw new Error("id_token payload is not readable");
  }

  if (!expectedAudience) throw new Error("no client id configured to check the audience against");
  if (payload.aud !== expectedAudience) throw new Error("id_token audience mismatch");
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
    throw new Error("id_token issuer mismatch");
  }
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    throw new Error("id_token has expired");
  }
  // Google encodes this as a boolean or the string "true" depending on context.
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new Error("Google has not verified that email address");
  }
  if (!payload.sub || !payload.email) throw new Error("id_token missing subject or email");

  return { sub: payload.sub, email: payload.email.trim().toLowerCase(), name: payload.name ?? null };
}
