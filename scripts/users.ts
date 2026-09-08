/**
 * Account management.
 *
 *   npm run user -- list
 *   npm run user -- add her@example.com "Maria"      # prompts for a password
 *   npm run user -- invite her@example.com "Maria"   # Google, or she sets a password at /signup
 *   npm run user -- role her@example.com owner    # owner = admin console
 *   npm run user -- budget her@example.com 2      # $2/day of coach; "none" = the full ceiling
 *   npm run user -- topup her@example.com 1       # $1 extra for today only, when she has run out
 *   npm run user -- passwd her@example.com
 *   npm run user -- signout-everywhere her@example.com
 *   npm run user -- disable her@example.com
 *   npm run user -- enable her@example.com
 *
 * Passwords are read from a prompt with echo off, never from argv — anything on
 * a command line lands in shell history and in the process table.
 */
import { createInterface } from "node:readline/promises";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { budgetFor, dollars, topUpFor } from "@/lib/budget";
import { today } from "@/lib/date";
import { LIMITS } from "@/lib/limits";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";

async function promptPassword(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // @ts-expect-error _writeToOutput is internal but is the standard way to mute echo.
  rl._writeToOutput = () => {};
  process.stdout.write(`${label}: `);
  const first = await rl.question("");
  process.stdout.write("\nConfirm: ");
  const second = await rl.question("");
  process.stdout.write("\n");
  rl.close();

  if (first !== second) throw new Error("Passwords didn't match.");
  if (first.length < 12) throw new Error("Use at least 12 characters — length beats complexity.");
  return first;
}

const normalise = (email: string) => email.trim().toLowerCase();

async function main() {
  const [command, emailArg, nameArg] = process.argv.slice(2);
  const email = emailArg ? normalise(emailArg) : "";

  switch (command) {
    case "list": {
      const rows = await db.select().from(users).orderBy(users.createdAt);
      if (rows.length === 0) { console.log("  No accounts yet. Create one with: npm run user -- add <email> <name>"); break; }
      // What each one may actually spend on the coach today, which is the
      // ceiling unless their own budget tightens it.
      const owned = await db.select({ userId: profiles.userId, chosen: profiles.dailyBudgetMicros }).from(profiles);
      const budgetLabels = new Map(owned.map((p) => [
        p.userId,
        `${dollars(p.chosen == null ? LIMITS.dailyCostMicros : Math.min(p.chosen, LIMITS.dailyCostMicros))}/day`.padEnd(9),
      ]));
      for (const u of rows) {
        console.log(
          `  ${u.email.padEnd(28)} ${(u.name ?? "—").padEnd(14)} ${u.role.padEnd(7)}` +
          `${u.disabledAt ? "DISABLED" : "active  "} ${budgetLabels.get(u.id) ?? "—".padEnd(9)} ` +
          `last login ${u.lastLoginAt?.toISOString().slice(0, 16).replace("T", " ") ?? "never"}`,
        );
      }
      break;
    }

    case "add": {
      if (!email) throw new Error("Usage: npm run user -- add <email> [name]");
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing) throw new Error(`${email} already exists.`);

      const password = await promptPassword("New password");
      const isFirst = (await db.select({ id: users.id }).from(users).limit(1)).length === 0;

      const [created] = await db.insert(users).values({
        email, name: nameArg ?? null,
        passwordHash: await hashPassword(password),
        role: isFirst ? "owner" : "member",
      }).returning();

      // Give them a profile immediately so the coach has somewhere to write.
      await db.insert(profiles).values({ userId: created.id, name: nameArg ?? null });
      console.log(`✓ ${email} created as ${created.role}, with an empty profile.`);
      break;
    }

    case "invite": {
      if (!email) throw new Error("Usage: npm run user -- invite <email> [name]");
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing) throw new Error(`${email} already exists.`);

      // No password: this account exists so that Google sign-in has something
      // to match against. Access is invite-only, and this is the invite.
      const isFirst = (await db.select({ id: users.id }).from(users).limit(1)).length === 0;
      const [created] = await db.insert(users).values({
        email, name: nameArg ?? null, passwordHash: null,
        role: isFirst ? "owner" : "member",
      }).returning();
      await db.insert(profiles).values({ userId: created.id, name: nameArg ?? null });

      console.log(`✓ ${email} invited as ${created.role}.`);
      console.log("  They sign in with Continue with Google, or choose their own password");
      console.log("  at /signup — that page claims an invitation and can never add one.");
      console.log(`  To set a password for them instead: npm run user -- passwd ${email}`);
      break;
    }

    case "passwd": {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) throw new Error(`No account for ${email}.`);
      const password = await promptPassword("New password");
      await db.update(users).set({
        passwordHash: await hashPassword(password),
        // A password change signs out every existing session, which is the
        // whole point of changing it after a scare.
        sessionsValidFrom: new Date(),
      }).where(eq(users.id, user.id));
      console.log(`✓ password changed for ${email}; all sessions signed out.`);
      break;
    }

    case "signout-everywhere": {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) throw new Error(`No account for ${email}.`);
      await db.update(users).set({ sessionsValidFrom: new Date() }).where(eq(users.id, user.id));
      console.log(`✓ every session for ${email} is now invalid.`);
      break;
    }

    case "role": {
      // Owner is the admin role: it is what /admin checks, and nothing else
      // in the app reads it. Deliberately not a tool — `users` is out of the
      // model's reach, so no prompt can promote anyone.
      const wanted = nameArg;
      if (wanted !== "owner" && wanted !== "member") {
        throw new Error("Usage: npm run user -- role <email> owner|member");
      }
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) throw new Error(`No account for ${email}.`);
      if (user.role === "owner" && wanted === "member") {
        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users)
          .where(eq(users.role, "owner"));
        // Removing the last owner locks the console for everyone, and no
        // screen can put it back — only this script can.
        if (n <= 1) throw new Error("That is the only owner. Promote someone else first.");
      }
      await db.update(users).set({ role: wanted }).where(eq(users.id, user.id));
      console.log(`✓ ${email} is now ${wanted}.`);
      break;
    }

    case "budget": {
      // Not a tool, for the same reason `role` is not one: this reaches
      // another person's account, and `users` is out of the model's reach.
      const said = nameArg;
      if (!email || !said) throw new Error("Usage: npm run user -- budget <email> <dollars-a-day|none>");
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) throw new Error(`No account for ${email}.`);
      const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
      if (!profile) throw new Error(`${email} has no profile yet — they have not signed in.`);

      const choice = budgetFor(said, LIMITS.dailyCostMicros);
      if (!choice.ok) throw new Error(choice.error);

      await db.update(profiles).set({ dailyBudgetMicros: choice.micros }).where(eq(profiles.id, profile.id));
      // The same event the in-app setting writes: a spend has to be
      // explainable later, whoever changed the number.
      await audit("budget.changed", {
        detail: { profileId: profile.id, byOwner: true, appliedMicros: choice.micros, ceiling: LIMITS.dailyCostMicros },
      });
      console.log(`✓ ${email} may spend ${choice.note} on the coach.`);
      break;
    }

    case "topup": {
      // The only thing in the app that lifts anyone above the deployment's
      // ceiling, which is exactly why it is here and not a tool: no session
      // and no prompt can reach this file.
      const said = nameArg;
      if (!email || !said) throw new Error("Usage: npm run user -- topup <email> <dollars-for-today|none>");
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) throw new Error(`No account for ${email}.`);
      const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
      if (!profile) throw new Error(`${email} has no profile yet — they have not signed in.`);

      const choice = topUpFor(said);
      if (!choice.ok) throw new Error(choice.error);

      const day = today();
      await db.update(profiles).set({
        topUpMicros: choice.micros ?? 0,
        topUpOn: choice.micros ? day : null,
        // The ask is answered either way, so the console stops showing it.
        topUpRequestedOn: null,
      }).where(eq(profiles.id, profile.id));
      await audit("topup.granted", { detail: { profileId: profile.id, micros: choice.micros, day } });

      const base = profile.dailyBudgetMicros == null
        ? LIMITS.dailyCostMicros : Math.min(profile.dailyBudgetMicros, LIMITS.dailyCostMicros);
      console.log(`✓ ${email}: ${choice.note}. Today's allowance is ${dollars(base + (choice.micros ?? 0))}; back to ${dollars(base)} tomorrow.`);
      break;
    }

    case "disable":
    case "enable": {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) throw new Error(`No account for ${email}.`);
      const disabling = command === "disable";
      await db.update(users).set({
        disabledAt: disabling ? new Date() : null,
        // Disabling must take effect immediately, not at token expiry.
        ...(disabling ? { sessionsValidFrom: new Date() } : {}),
      }).where(eq(users.id, user.id));
      console.log(`✓ ${email} ${disabling ? "disabled" : "enabled"}.`);
      break;
    }

    default:
      console.log(`Usage:
  npm run user -- list
  npm run user -- add <email> [name]
  npm run user -- invite <email> [name]
  npm run user -- passwd <email>
  npm run user -- role <email> owner|member
  npm run user -- signout-everywhere <email>
  npm run user -- disable <email>
  npm run user -- enable <email>`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
