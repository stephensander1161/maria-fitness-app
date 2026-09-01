/**
 * Single-user passphrase auth. Deliberately dependency-free and built on Web
 * Crypto only, so the exact same code runs in edge middleware (where the gate
 * has to live, before any route code executes) and in Node route handlers.
 *
 * The cookie is a stateless signed token: `<expiryMs>.<base64url hmac>`. No
 * session table means no lookup on every request, and revocation is a secret
 * rotation — the right trade for one user.
 */

export const SESSION_COOKIE = "coach_session";
const SESSION_DAYS = 30;

const enc = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(message));
  return new Uint8Array(sig);
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant time over equal-length inputs; length differences leak only length. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Compare HMACs rather than the raw strings: digests are fixed-length, so the
 * comparison is genuinely constant time and reveals nothing about passphrase
 * length.
 */
export async function passphraseMatches(attempt: string, expected: string, secret: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    hmac(secret, `pass:${attempt}`),
    hmac(secret, `pass:${expected}`),
  ]);
  return safeEqual(b64url(a), b64url(b));
}

export type Session = { userId: string; issuedAt: number; expiry: number };

/**
 * `userId.issuedAt.expiry.signature` — stateless, so the edge gate can verify
 * it without a database round trip. `issuedAt` is what makes per-user
 * revocation possible: a route can compare it against the account's
 * sessionsValidFrom and reject anything older.
 */
export async function createSessionToken(secret: string, userId: string): Promise<string> {
  const issuedAt = Date.now();
  const expiry = issuedAt + SESSION_DAYS * 86_400_000;
  const payload = `${userId}.${issuedAt}.${expiry}`;
  return `${payload}.${b64url(await hmac(secret, `session:${payload}`))}`;
}

/** Signature and expiry only — cheap, and safe to run on the edge. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<Session | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [userId, issued, expires, signature] = parts;
  const issuedAt = Number(issued);
  const expiry = Number(expires);
  if (!userId || !Number.isFinite(issuedAt) || !Number.isFinite(expiry)) return null;
  if (expiry < Date.now()) return null;

  const expected = b64url(await hmac(secret, `session:${userId}.${issued}.${expires}`));
  if (!safeEqual(signature, expected)) return null;

  return { userId, issuedAt, expiry };
}

export const sessionCookieOptions = {
  httpOnly: true,           // unreachable from JS, so XSS can't lift the session
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, // blocks cross-site POSTs; no CSRF token needed
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};
