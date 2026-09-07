import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  BACKUP_KEEP_AT_LEAST, BACKUP_PREFIX, BACKUP_RETENTION_DAYS, BACKUP_TABLES, backupKey, staleBackups,
} from "@/lib/backup";

const read = (p: string) => fs.readFileSync(p, "utf8");
const day = 86_400_000;
const at = (now: Date, daysAgo: number, name = `b${daysAgo}`) => ({
  pathname: `${BACKUP_PREFIX}${name}.json`,
  uploadedAt: new Date(now.getTime() - daysAgo * day),
});

suite("the nightly backup", () => {
  const now = new Date("2026-09-07T09:00:00Z");

  it("is named by the day, so a re-run overwrites rather than doubles", () => {
    expect(backupKey(now)).toBe("backups/plate-2026-09-07.json");
    expect(backupKey(new Date("2026-09-07T23:59:00Z"))).toBe(backupKey(now));
  });

  it("keeps a month and removes what is older", () => {
    const stored = [at(now, 0), at(now, 1), at(now, 2), at(now, 10), at(now, 29), at(now, 31), at(now, 60)];
    expect(staleBackups(stored, now).sort()).toEqual(["backups/b31.json", "backups/b60.json"]);
    expect(BACKUP_RETENTION_DAYS).toBe(30);
  });

  it("never removes the newest few, however old they are", () => {
    // A cron that stopped firing for two months must not have its silence
    // completed by the retention rule deleting the last copies there were.
    const stored = [at(now, 61), at(now, 62), at(now, 63), at(now, 90)];
    expect(staleBackups(stored, now)).toEqual(["backups/b90.json"]);
    expect(BACKUP_KEEP_AT_LEAST).toBeGreaterThanOrEqual(3);
    expect(staleBackups([at(now, 400)], now)).toEqual([]);
  });

  it("is not fooled by the order the store lists them in", () => {
    const stored = [at(now, 90), at(now, 0), at(now, 61), at(now, 1)];
    expect(staleBackups(stored, now)).toEqual(["backups/b90.json"]);
  });

  it("is the one list the restore script refills from, parents first", () => {
    // Two hand-kept copies of this list are how a table gets backed up and
    // never restored. The restore imports the dump's list.
    const restore = read("scripts/restore.ts");
    expect(restore).toMatch(/import \{ BACKUP_TABLES as TABLES \} from "@\/lib\/backup"/);
    expect(restore).not.toMatch(/const TABLES = \{/);
    const order = Object.keys(BACKUP_TABLES);
    expect(order.indexOf("profiles")).toBeLessThan(order.indexOf("weighIns"));
    expect(order.indexOf("plans")).toBeLessThan(order.indexOf("planDays"));
    expect(order.indexOf("workouts")).toBeLessThan(order.indexOf("setLogs"));
    expect(order.indexOf("mealPlans")).toBeLessThan(order.indexOf("meals"));
  });

  it("holds her data and never the accounts", () => {
    // A dump with password hashes in it would have to be handled like one.
    expect(Object.keys(BACKUP_TABLES)).not.toContain("users");
    expect(Object.keys(BACKUP_TABLES)).not.toContain("auditLog");
  });

  it("is scheduled, off the edge, and refuses without a store", () => {
    const vercel = JSON.parse(read("vercel.json"));
    expect(vercel.crons.map((c: { path: string }) => c.path)).toContain("/api/cron/backup");
    const route = read("app/api/cron/backup/route.ts");
    expect(route).toMatch(/runtime = "nodejs"/);
    expect(route).toMatch(/status: 503/);
    expect(route).toMatch(/"backup\.failed"/);
    // The put comes before the prune: a failed write must not also delete.
    const lib = read("lib/backup.ts");
    expect(lib.indexOf("await putPrivate(")).toBeLessThan(lib.indexOf("await del("));
    expect(read("lib/blob.ts")).toMatch(/access: "private"/);
  });
});
