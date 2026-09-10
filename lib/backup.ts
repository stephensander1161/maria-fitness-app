import { del, list } from "@vercel/blob";
import { db } from "@/lib/db";
import { blobConfigured, putPrivate } from "@/lib/blob";
import {
  complaints, cycleEvents, factViews, feedback, friendships, goals, highFives, mealLogs, mealPlans, meals, measurements, messages,
  pantryItems, photos, planDays, planExercises, plans, preppedPortions, profiles,
  pushSubscriptions, savedMeals, setLogs, shoppingExtras,
  sleepLogs, usageDaily, weighIns, workouts,
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
 * Reference data (exercises, facts, templates) is seeded from source and left
 * out. Rate-limit events are ephemeral. `users` is deliberately absent: the
 * dump has always been of her data, not of credentials, and a file that held
 * password hashes would need to be treated as one. Accounts are three rows
 * re-created by `npm run user -- invite` in a minute.
 *
 * Photos: the row is here, the image is not once it lives in the blob store
 * (`photos.blob_key`). The store is itself durable storage, and a backup that
 * copied every photo every night would be a second store of her body.
 */

// Order matters for restore: parents before children.
export const BACKUP_TABLES = {
  profiles, weighIns, sleepLogs, measurements, goals, photos, complaints, cycleEvents,
  plans, planDays, planExercises,
  workouts, setLogs,
  mealPlans, meals, mealLogs, pantryItems, preppedPortions, shoppingExtras,
  messages, feedback, factViews, usageDaily, pushSubscriptions, savedMeals,
  friendships, highFives,
} as const;

export const BACKUP_SCHEMA_VERSION = 1;
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
    out[name] = data;
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
