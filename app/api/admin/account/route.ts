import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { requireOwner } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { budgetFor, topUpFor } from "@/lib/budget";
import { LIMITS } from "@/lib/limits";
import { today } from "@/lib/date";

export const runtime = "nodejs";

/**
 * The owner's write path: budgets, one-day top-ups, who else is an owner, and
 * who can still sign in.
 *
 * **A route, not a tool**, and that is the whole design. `users` is out of the
 * model's reach and a top-up is the one thing that can take somebody above the
 * deployment's ceiling — CLAUDE.md puts it plainly: a prompt that could grant
 * is a prompt that could buy itself an unlimited day. Account deletion is a
 * route for the same reason. Nothing here is in the registry, so no sentence
 * anybody types at the coach can reach any of it.
 *
 * The arithmetic is `lib/budget.ts`, unchanged and shared with the command
 * line, so the screen cannot be more permissive than the terminal: a budget
 * still only ever *tightens* the ceiling, and a top-up is still capped at
 * MAX_TOP_UP_MICROS however it is asked for.
 *
 * Everything here is audited. Changing what somebody may spend, or who can see
 * the console, is exactly the class of action COMPLIANCE.md says must be.
 */
type Body = {
  userId?: string;
  action?: "budget" | "topup" | "role" | "access";
  /** Dollars as typed for a budget or a top-up; "owner"/"member" for a role. */
  value?: string;
  /** The account's email, retyped, for a role change or a lockout. See below. */
  confirmEmail?: string;
};

export async function POST(req: Request) {
  const owner = await requireOwner();
  const { userId, action, value, confirmEmail } = (await req.json().catch(() => ({}))) as Body;

  if (typeof userId !== "string" || typeof value !== "string") {
    return Response.json({ ok: false, error: "userId and value are required." }, { status: 400 });
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return Response.json({ ok: false, error: "No such account." }, { status: 404 });

  if (action === "role") {
    const wanted = value === "owner" ? "owner" : value === "member" ? "member" : null;
    if (!wanted) return Response.json({ ok: false, error: "Role must be owner or member." }, { status: 400 });

    /*
      The email, retyped.

      Not theatre: this screen is a list of people and the control is a button
      beside each of them, so the failure it guards against is a mis-tap
      granting the console to the wrong account — which is silent, and which
      nothing on this screen would show you afterwards.
    */
    if ((confirmEmail ?? "").trim().toLowerCase() !== target.email.toLowerCase()) {
      return Response.json(
        { ok: false, error: "Type the account's email exactly to confirm." },
        { status: 400 },
      );
    }

    // Removing the last owner locks the console for everybody, and no screen
    // can put it back — only the command line can.
    if (target.role === "owner" && wanted === "member") {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
        .from(users).where(eq(users.role, "owner"));
      if (n <= 1) {
        return Response.json(
          { ok: false, error: "That is the only owner. Promote someone else first." },
          { status: 400 },
        );
      }
    }

    await db.update(users).set({ role: wanted }).where(eq(users.id, target.id));
    await audit("admin.role_changed", {
      req,
      detail: { by: owner.id, userId: target.id, to: wanted },
    });
    return Response.json({ ok: true, role: wanted });
  }

  if (action === "access") {
    /*
      Locking somebody out, and letting them back in.

      It was the command line only, which meant the one action with a reason to
      be immediate — somebody's phone is gone, somebody has left — needed a
      terminal and the production credential. The rules do not move: this is a
      route rather than a tool, `users` stays out of the model's reach, and
      disabling bumps `sessionsValidFrom` so it takes effect on their next
      request rather than at token expiry.

      Nothing is deleted. A disabled account keeps every row it has, which is
      the difference between this and the delete route, and it is why this is
      the reversible one.
    */
    const disabling = value === "off";
    if (value !== "off" && value !== "on") {
      return Response.json({ ok: false, error: "Access must be on or off." }, { status: 400 });
    }

    // The same retyped email as a role change, and for the same reason: a list
    // of people with a button beside each of them, and a mis-tap here signs
    // somebody out of their own account with nothing on screen to say why.
    if ((confirmEmail ?? "").trim().toLowerCase() !== target.email.toLowerCase()) {
      return Response.json(
        { ok: false, error: "Type the account's email exactly to confirm." },
        { status: 400 },
      );
    }

    // Locking yourself out of the console you are standing in. There is no
    // screen that puts this back — only the command line.
    if (disabling && target.id === owner.id) {
      return Response.json(
        { ok: false, error: "That is your own account. Somebody else has to do this one." },
        { status: 400 },
      );
    }

    // …and the same for the last owner anyone can still sign in as.
    if (disabling && target.role === "owner") {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
        .from(users).where(and(eq(users.role, "owner"), isNull(users.disabledAt)));
      if (n <= 1) {
        return Response.json(
          { ok: false, error: "That is the only owner who can still sign in." },
          { status: 400 },
        );
      }
    }

    await db.update(users).set({
      disabledAt: disabling ? new Date() : null,
      // Immediately, not at token expiry: a session already issued is exactly
      // the thing being taken away.
      ...(disabling ? { sessionsValidFrom: new Date() } : {}),
    }).where(eq(users.id, target.id));
    await audit(disabling ? "admin.account_disabled" : "admin.account_enabled", {
      req,
      detail: { by: owner.id, userId: target.id },
    });
    return Response.json({
      ok: true,
      note: disabling
        ? "Signed out and locked. Nothing was deleted."
        : "Back in. They can sign in again now.",
    });
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, target.id)).limit(1);
  if (!profile) return Response.json({ ok: false, error: "That account has no profile yet." }, { status: 400 });

  if (action === "budget") {
    // Only ever tightens — the same refusal the terminal gives, from the same
    // function, so the screen cannot be the permissive way in.
    const choice = budgetFor(value, LIMITS.dailyCostMicros);
    if (!choice.ok) return Response.json({ ok: false, error: choice.error }, { status: 400 });
    await db.update(profiles).set({ dailyBudgetMicros: choice.micros }).where(eq(profiles.id, profile.id));
    await audit("admin.budget_set", {
      req,
      detail: { by: owner.id, userId: target.id, micros: choice.micros },
    });
    return Response.json({ ok: true, note: choice.note });
  }

  if (action === "topup") {
    const choice = topUpFor(value);
    if (!choice.ok) return Response.json({ ok: false, error: choice.error }, { status: 400 });
    await db.update(profiles).set({
      topUpMicros: choice.micros ?? 0,
      // One global day, like the spend ledger it lifts — see lib/limits.ts.
      topUpOn: choice.micros ? today() : null,
      // Answered, so the console stops showing them as waiting.
      topUpRequestedOn: null,
    }).where(eq(profiles.id, profile.id));
    await audit("admin.top_up_granted", {
      req,
      detail: { by: owner.id, userId: target.id, micros: choice.micros },
    });
    return Response.json({ ok: true, note: choice.note });
  }

  return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
