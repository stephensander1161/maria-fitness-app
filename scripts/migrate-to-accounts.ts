/**
 * One-time migration from the shared passphrase to per-user accounts.
 *
 *   npm run migrate:accounts -- you@example.com "Your Name"
 *
 * Creates the first account using APP_PASSPHRASE as its initial password, so
 * nothing locks you out mid-migration, and adopts any profile that predates
 * accounts. Change the password immediately afterwards:
 *
 *   npm run user -- passwd you@example.com
 *
 * Safe to re-run: it does nothing if accounts already exist.
 */
import { isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";

async function main() {
  const [emailArg, name] = process.argv.slice(2);
  if (!emailArg) throw new Error('Usage: npm run migrate:accounts -- <email> ["Name"]');
  const email = emailArg.trim().toLowerCase();

  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    console.log("  Accounts already exist — nothing to migrate.");
    process.exit(0);
  }

  const passphrase = process.env.APP_PASSPHRASE;
  if (!passphrase) {
    throw new Error("APP_PASSPHRASE is not set; nothing to carry over. Use `npm run user -- add` instead.");
  }

  const [owner] = await db.insert(users).values({
    email,
    name: name ?? null,
    passwordHash: await hashPassword(passphrase),
    role: "owner",
  }).returning();
  console.log(`  ✓ owner account created: ${email}`);

  // Profiles created before accounts existed have no owner.
  const adopted = await db.update(profiles)
    .set({ userId: owner.id })
    .where(isNull(profiles.userId))
    .returning({ id: profiles.id, name: profiles.name });

  console.log(`  ✓ ${adopted.length} existing profile(s) attached${adopted[0]?.name ? ` (${adopted[0].name})` : ""}`);
  console.log("\n  Your password is the old APP_PASSPHRASE. Change it now:");
  console.log(`    npm run user -- passwd ${email}`);
  console.log("  Then add her account:");
  console.log(`    npm run user -- add her@example.com "Maria"`);
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
