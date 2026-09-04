/**
 * Sign-up is claiming an invitation.
 *
 * There is no open registration. The allowlist is the `users` table — both
 * doors (password and Google) already refuse anyone not in it — and the only
 * thing that adds to it is `npm run user -- invite`. What sign-up adds is the
 * ability for an invited person to choose their own password, rather than
 * have an owner type one for them over the phone.
 *
 * Pure on purpose, like `accountAccepts` in lib/session.ts: the route is thin,
 * and the decision about who may claim what is the part worth testing.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 400;
const MAX_EMAIL_LENGTH = 200;
const MAX_NAME_LENGTH = 80;

export type SignupInput = { email: string; password: string; name: string | null };

export type SignupParse =
  | { ok: true; input: SignupInput }
  | { ok: false; reason: "invalid_email" | "too_short" | "too_long"; message: string };

/** Said plainly, because she will read it on the form. */
export const PASSWORD_RULE = `At least ${MIN_PASSWORD_LENGTH} characters — length beats complexity.`;

export function parseSignup(body: unknown): SignupParse {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH) : "";
  const password = typeof b.password === "string" ? b.password : "";
  const rawName = typeof b.name === "string" ? b.name.trim().slice(0, MAX_NAME_LENGTH) : "";

  // Deliberately loose: the address only has to match the one that was
  // invited, and the invitation was typed by a person who knew it.
  const at = email.indexOf("@");
  if (at < 1 || at === email.length - 1 || /\s/.test(email)) {
    return { ok: false, reason: "invalid_email", message: "That doesn't look like an email address." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "too_short", message: PASSWORD_RULE };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: "too_long", message: `Keep it under ${MAX_PASSWORD_LENGTH} characters.` };
  }
  return { ok: true, input: { email, password, name: rawName || null } };
}

export type ClaimRefusal = "not_invited" | "disabled" | "already_claimed";

/**
 * Whether whoever holds this address may claim the account for it.
 *
 * Only an invitation nobody has used yet: no password, never linked to
 * Google, never signed in. The moment an account has been used by any door,
 * sign-up for its address closes — otherwise anyone who knew the address of
 * a Google-only account could set a password on it and walk in.
 */
export function claimable(
  user: {
    passwordHash: string | null;
    googleSub: string | null;
    lastLoginAt: Date | null;
    disabledAt: Date | null;
  } | null,
): ClaimRefusal | null {
  if (!user) return "not_invited";
  if (user.disabledAt) return "disabled";
  if (user.passwordHash || user.googleSub || user.lastLoginAt) return "already_claimed";
  return null;
}
