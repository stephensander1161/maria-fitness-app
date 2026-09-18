import { del, list } from "@vercel/blob";
import { db } from "@/lib/db";
import { blobConfigured, putPrivate } from "@/lib/blob";
import {
  complaints, conversations, cycleEvents, exercises, factViews, facts, feedback, foodEstimates, foods, friendships, goals, highFives, mealLogs, mealPlans, mealTemplateItems, mealTemplates, meals, measurements, messages, pantryItems, photos, planDays, planExercises, plans, preppedPortions, profiles, pushSubscriptions, savedMeals, setLogs, shoppingExtras, sleepLogs, usageDaily, users, waterLogs, weighIns, workoutTemplateDays, workoutTemplateExercises, workoutTemplates, workouts,
} from "@/lib/db/schema";

/**
 * Everything of hers, as one JSON document.
 *
 * Neon's free tier has no point-in-time recovery, so a bad migration, a wrong
 * DELETE or an accidental db:reset is unrecoverable — and until this ran on a
 * schedule the only copies were whatever `npm run backup` had last written to
 * one laptop, six days stale at the time of writing. The nightly cron
 * (`/api/cron/backup`) puts this document in a *private* Vercel Blob store,
 * off the machine and off the database, and keeps a month of them.
 *
 * Reference data (exercises, facts, foods, templates) is in as well. It was
 * left out — "seeded from source, restoring it would only bloat the file" —
 * and the same restore drill showed the flaw: a seed gives every row a fresh
 * id, so a plan restored into a freshly seeded database points at exercises
 * that database never had. The ids have to travel with the rows that point
 * at them. (And `foods` was never only reference data: the foods she asks
 * the app to remember live there too.) A few hundred rows; the file is
 * still small. After a restore, `db:seed` still updates them in place by
 * slug, ids untouched. Rate-limit events are ephemeral.
 *
 * `users` is in, without its password hashes. It was deliberately absent —
 * "accounts are three rows re-created by `npm run user -- invite` in a
 * minute" — and the first restore drill (2026-09-18, into an empty Neon
 * branch) showed why that was wrong: a re-created account has a new id, and
 * every profile row points at the old one. The restore failed on the first
 * foreign key. So the account rows travel — id, email, name, role, the Google
 * link — and the one column that is a credential is blanked. The file still
 * holds nothing that signs anyone in; after a restore, password accounts need
 * `npm run user -- passwd` and Google accounts just sign in.
 *
 * Photos: the row is here, the image is not once it lives in the blob store
 * (`photos.blob_key`). The store is itself durable storage, and a backup that
 * copied every photo every night would be a second store of her body.
 */

// Order matters for restore: parents before children.
export const BACKUP_TABLES = {
  // Reference first: everything of hers points into it.
  exercises, facts, foods,
  workoutTemplates, workoutTemplateDays, workoutTemplateExercises,
  mealTemplates, mealTemplateItems,
  users,
  profiles, weighIns, sleepLogs, waterLogs, measurements, goals, photos, complaints, cycleEvents,
  plans, planDays, planExercises,
  workouts, setLogs,
  mealPlans, meals, mealLogs, pantryItems, preppedPortions, shoppingExtras, foodEstimates,
  conversations, messages, feedback, factViews, usageDaily, pushSubscriptions, savedMeals,
  friendships, highFives,
} as const;

export const BACKUP_SCHEMA_VERSION = 2;
export const BACKUP_PREFIX = "backups/";
export const BACKUP_RETENTION_DAYS = 30;
/**
 * However old they are, this many are always kept. A cron that stopped
 * firing for a month must not have its silence completed by the retention
 * rule deleting the last copies there were.
 */
export const BACKUP_KEEP_AT_LEAST = 3;

export type Dump = {
  json: string;
  rows: number;
  tables: Record<string, number>;
};

export async function dumpEverything(now = new Date()): Promise<Dump> {
  const out: Record<string, unknown[]> = {};
  const tables: Record<string, number> = {};
  let rows = 0;
  for (const [name, table] of Object.entries(BACKUP_TABLES)) {
    const data = await db.select().from(table);
    // The account rows, not the credential: see the note at the top.
    out[name] = name === "users"
      ? data.map((row) => ({ ...row, passwordHash: null }))
      : data;
    tables[name] = data.length;
    rows += data.length;
  }
  const json = JSON.stringify(
    { takenAt: now.toISOString(), schemaVersion: BACKUP_SCHEMA_VERSION, tables: out },
    null,
    2,
  );
  return { json, rows, tables };
}

/** One a day, named by the day, so a re-run overwrites rather than doubles. */
export const backupKey = (now: Date): string =>
  `${BACKUP_PREFIX}plate-${now.toISOString().slice(0, 10)}.json`;

/**
 * Which stored backups to remove: older than the retention window, never the
 * newest few. Pure, so the rule is tested rather than trusted.
 */
export function staleBackups(
  blobs: { pathname: string; uploadedAt: Date }[],
  now: Date,
): string[] {
  const cutoff = now.getTime() - BACKUP_RETENTION_DAYS * 86_400_000;
  const newestFirst = [...blobs].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  return newestFirst
    .slice(BACKUP_KEEP_AT_LEAST)
    .filter((b) => b.uploadedAt.getTime() < cutoff)
    .map((b) => b.pathname);
}

export { blobConfigured };

export type BackupResult = { key: string; rows: number; kb: number; pruned: number };

/**
 * Take tonight's backup and apply the retention rule. Throws if there is no
 * store — the route turns that into a 503 rather than a quiet success.
 */
export async function takeBackup(now = new Date()): Promise<BackupResult> {
  if (!blobConfigured()) throw new Error("No BLOB_READ_WRITE_TOKEN configured");
  const dump = await dumpEverything(now);
  const key = backupKey(now);
  await putPrivate(key, dump.json, "application/json");

  // Prune after the write, never before: a failed put must not also delete.
  const stored: { pathname: string; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BACKUP_PREFIX, cursor });
    stored.push(...page.blobs.map((b) => ({ pathname: b.pathname, uploadedAt: new Date(b.uploadedAt) })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const stale = staleBackups(stored, now);
  if (stale.length > 0) await del(stale);

  return { key, rows: dump.rows, kb: Math.round(Buffer.byteLength(dump.json) / 1024), pruned: stale.length };
}
