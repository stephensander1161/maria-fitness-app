/**
 * Account management.
 *
 *   npm run user -- list
 *   npm run user -- add her@example.com "Maria"      # prompts for a password
 *   npm run user -- invite her@example.com "Maria"   # Google, or she sets a password at /signup
 *   npm run user -- passwd her@example.com
 *   npm run user -- signout-everywhere her@example.com
 *   npm run user -- disable her@example.com
 *   npm run user -- enable her@example.com
 *
 * Passwords are read from a prompt with echo off, never from argv — anything on
 * a command line lands in shell history and in the process table.
 */
import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
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
      for (const u of rows) {
        console.log(
          `  ${u.email.padEnd(28)} ${(u.name ?? "—").padEnd(14)} ${u.role.padEnd(7)}` +
          `${u.disabledAt ? "DISABLED" : "active  "} last login ${u.lastLoginAt?.toISOString().slice(0, 16).replace("T", " ") ?? "never"}`,
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
  npm run user -- signout-everywhere <email>
  npm run user -- disable <email>
  npm run user -- enable <email>`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
