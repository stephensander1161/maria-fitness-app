import { createHash, randomBytes } from "node:crypto";

/**
 * Password reset, and the invitation link, as one mechanism: a token that is
 * emailed, hashed at rest, and good once.
 *
 * "The first client who forgets a password is a support ticket." Until now
 * it was: an owner ran `npm run user -- passwd` and read a password out over
 * the phone. This is the self-service version, built the way the rest of the
 * door is built:
 *
 * - The link carries 32 random bytes; the table holds only their SHA-256, so
 *   a copy of the database cannot be turned into a link.
 * - One use, and an hour for a reset (a week for an invitation, which is
 *   read at leisure). Every earlier token for the same account and kind is
 *   cancelled when a new one is issued, so the newest email is the one that
 *   works and a stale one in an old inbox does not.
 * - A successful reset bumps `sessions_valid_from`: whoever was signed in on
 *   a lost phone is signed out, which is most of the reason to reset.
 * - Asking for a reset always answers the same way, whether or not the
 *   address has an account — the door never says which addresses exist.
 */
export const RESET_TTL_MS = 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TokenKind = "reset" | "invite";

export const ttlFor = (kind: TokenKind): number => (kind === "reset" ? RESET_TTL_MS : INVITE_TTL_MS);

/** The secret half, for the link; base64url so it survives an email client. */
export const newToken = (): string => randomBytes(32).toString("base64url");

/** What is stored. A stolen table holds only these. */
export const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

/** A token as it arrives from the URL: the shape, or nothing. */
export function parseToken(raw: unknown): string | null {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{40,50}$/.test(raw) ? raw : null;
}

export type StoredToken = { kind: TokenKind; expiresAt: Date; usedAt: Date | null };

/** Why a stored token cannot be used, or null when it can. */
export function refusal(row: StoredToken | null, kind: TokenKind, now = new Date()): "unknown" | "used" | "expired" | "wrong_kind" | null {
  if (!row) return "unknown";
  if (row.kind !== kind) return "wrong_kind";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

/** Where the link points. The deployment's own origin, never the request's Host. */
export function linkFor(kind: TokenKind, token: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  return kind === "reset" ? `${base}/reset?token=${token}` : `${base}/signup?token=${token}`;
}
