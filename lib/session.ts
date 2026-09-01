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
  if (!user || user.disabledAt) return null;

  // Revocation: anything issued before the account's cutoff is dead.
  if (session.issuedAt < user.sessionsValidFrom.getTime()) return null;

  return user;
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
