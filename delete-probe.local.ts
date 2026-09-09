/** Delete a logged set from the movement page, the way a thumb does. Throwaway account. */
import { chromium, devices } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, setLogs, users, weighIns, workouts } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { runTool } from "@/lib/tools";
import { profileToday } from "@/lib/profile";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const EMAIL = "delete-probe@probe.invalid"; const PASSWORD = "probe-password-not-real-123";
const OUT = process.argv[2]!;
const log = (...a: unknown[]) => console.log("[delete]", ...a);

async function count(profileId: string) {
  const rows = await db.select({ n: setLogs.setNumber }).from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id)).where(eq(workouts.profileId, profileId));
  return rows.map((r) => r.n).sort();
}

async function main() {
  const [stale] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  if (stale) await db.delete(users).where(eq(users.id, stale.id));
  const [u] = await db.insert(users).values({ email: EMAIL, name: "D", passwordHash: await hashPassword(PASSWORD), role: "member" }).returning();
  const browser = await chromium.launch();
  const fails: string[] = [];
  try {
    const [p] = await db.insert(profiles).values({
      userId: u.id, name: "D", birthYear: 1990, sex: "male", heightCm: 180, startWeightKg: 80, goalWeightKg: 85,
      experience: "returning", daysPerWeek: 3, sessionMinutes: 45, equipment: ["dumbbells"], units: "imperial",
      timezone: "America/Edmonton", onboardedAt: new Date(),
    }).returning();
    await db.insert(weighIns).values({ profileId: p.id, date: profileToday(p), weightKg: 80 });
    await runTool("add_exercise_to_day", { slug: "bicep-curl", sets: 3, reps: 10 }, { profileId: p.id });
    await runTool("start_workout", {}, { profileId: p.id });
    for (const reps of [10, 9]) await runTool("log_set", { exerciseSlug: "bicep-curl", reps, weight: 20 }, { profileId: p.id });
    log("sets before:", await count(p.id));

    // The tool by itself, with exactly what the card sends on today.
    const direct = await runTool("delete_set", { exerciseSlug: "bicep-curl", setNumber: 2 }, { profileId: p.id });
    log("delete_set direct →", JSON.stringify(direct).slice(0, 160));
    log("sets after direct:", await count(p.id));
    await runTool("log_set", { exerciseSlug: "bicep-curl", reps: 9, weight: 20 }, { profileId: p.id });

    const page = await (await browser.newContext({ ...devices["iPhone 14 Pro"], hasTouch: true })).newPage();
    page.on("console", (m) => { if (m.type() === "error") console.log("  browser:", m.text().slice(0, 160)); });
    page.on("response", (r) => { if (r.url().includes("/api/action") && r.status() >= 400) console.log("  action →", r.status()); });
    await page.goto(`${BASE}/login`, { waitUntil: "load" }); await page.waitForTimeout(800);
    await page.getByPlaceholder("Email").fill(EMAIL); await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Enter" }).click();
    await page.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 30000 });
    await page.goto(`${BASE}/train/bicep-curl`, { waitUntil: "load" }); await page.waitForTimeout(3000);

    const sq = page.getByRole("button", { name: /^Edit set 1:/ });
    log("logged squares:", await page.getByRole("button", { name: /^Edit set \d/ }).count());
    if (await sq.count() === 0) { fails.push("no editable square for set 1"); }
    else {
      await sq.first().click(); await page.waitForTimeout(600);
      const del = page.getByRole("button", { name: "Delete" });
      log("Delete visible:", await del.count(), "| in view:", await del.first().isVisible().catch(() => false));
      if (await del.count() === 0) fails.push("no Delete button after tapping the square");
      else {
        await del.first().click({ timeout: 5000 }).catch((e) => fails.push("Delete click failed: " + String(e).slice(0, 120)));
        await page.waitForTimeout(3500);
        const after = await count(p.id);
        log("sets after UI delete:", after);
        if (after.length !== 1) fails.push(`expected 1 set left, got ${after.length}`);
        const err = await page.locator('[role="alert"]').allInnerTexts();
        if (err.length) log("alerts:", err);
        log("squares now:", await page.getByRole("button", { name: /^Edit set \d/ }).count());
      }
    }
    await page.screenshot({ path: `${OUT}/delete.png` });
  } finally { await browser.close(); await db.delete(users).where(eq(users.id, u.id)); log("cleaned up"); }
  if (fails.length) { console.error("[delete] FAILED", fails); process.exit(1); }
  log("OK"); process.exit(0);
}
main().catch((e) => { console.error("[delete] FAILED", e); process.exit(1); });
