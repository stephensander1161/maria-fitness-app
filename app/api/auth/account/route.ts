import { cookies } from "next/headers";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** Typed by her, exactly, so a stray tap cannot do this. */
export const CONFIRMATION = "delete my account";

/**
 * Delete the account, and with it everything.
 *
 * Every table that holds anything about her cascades from `users`, so this is
 * one statement and there is nothing left to forget. It is a route rather than
 * a tool on purpose: `users` is out of the model's reach, and "delete my
 * account" is the one sentence a prompt must never be able to say on her
 * behalf. She types the confirmation herself.
 *
 * Immediate and permanent. No grace period, because a grace period is a copy
 * of her data she has asked not to exist, and no backup restore from here —
 * that is the owner's `npm run restore`, which is a deliberate act.
 */
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== CONFIRMATION) {
    return Response.json({ error: `Type "${CONFIRMATION}" to confirm.` }, { status: 400 });
  }

  // The last owner cannot leave. With no owner there is no console and no way
  // to make another one from inside the app — only the command line can, and
  // an app whose only admin has deleted themselves is not a state to allow.
  if (user.role === "owner") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users)
      .where(and(eq(users.role, "owner"), ne(users.id, user.id)));
    if (n === 0) {
      return Response.json(
        { error: "You are the only owner. Make someone else an owner first, or use the command line." },
        { status: 409 },
      );
    }
  }

  // Recorded before the row goes, so the id in the log is the id that was
  // deleted rather than one that never existed.
  await audit("account.deleted", { req, detail: { userId: user.id, role: user.role } });

  await db.delete(users).where(eq(users.id, user.id));

  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return Response.json({ ok: true });
}
