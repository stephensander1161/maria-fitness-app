import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * The authoritative check, in two layers.
 *
 * Middleware verifies the signature and expiry on the edge — cheap, and enough
 * to turn away anyone without a valid token before any code runs. But a
 * stateless token cannot know that an account was disabled a minute ago, or
 * that she hit "sign out everywhere". That is what this does, in Node, where
 * the database is reachable.
 */
export async function currentUser(): Promise<User | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token, secret);
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return accountAccepts(user ?? null, session) ? user : null;
}

/**
 * The half of the check the edge cannot do.
 *
 * Middleware verifies the signature and the expiry, because it has no
 * database. Whether the account still exists, is still enabled, and has not
 * been signed out everywhere since the token was issued is decided here — and
 * both layers are load-bearing, so this is pure and tested rather than four
 * lines nobody has ever exercised.
 */
export function accountAccepts(
  user: { disabledAt: Date | null; sessionsValidFrom: Date } | null,
  session: { issuedAt: number },
): boolean {
  if (!user) return false;
  // Disabled means disabled from this moment, including for a token that is
  // otherwise perfectly valid and unexpired.
  if (user.disabledAt) return false;
  // "Sign out everywhere" is a cutoff, not a list: anything issued before it
  // is dead, which is what makes revocation work without tracking tokens.
  return session.issuedAt >= user.sessionsValidFrom.getTime();
}

/** For server components. Sends her to sign in rather than rendering an empty shell. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * A profile that is actually ready to be used. Anyone who has not been through
 * the first-run flow is sent there instead of landing in an empty app with no
 * plan, no targets and nothing to do — which is exactly what made the first
 * version feel like work.
 */
export async function requireOnboarded() {
  const user = await requireUser();
  const { getProfile } = await import("@/lib/profile");
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) redirect("/welcome");
  return profile;
}
