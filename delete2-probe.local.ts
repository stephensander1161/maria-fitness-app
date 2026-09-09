/** Set deletion from a closed card (phone) and from the lifted card (desktop); focus while typing. */
import { chromium, devices } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, setLogs, users, weighIns, workouts } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { runTool } from "@/lib/tools";
import { profileToday } from "@/lib/profile";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const EMAIL = "delete2-probe@probe.invalid"; const PASSWORD = "probe-password-not-real-123";
const OUT = process.argv[2]!;
const log = (...a: unknown[]) => console.log("[delete2]", ...a);
const count = async (profileId: string) => (await db.select({ n: setLogs.id }).from(setLogs)
  .innerJoin(workouts, eq(setLogs.workoutId, workouts.id)).where(eq(workouts.profileId, profileId))).length;

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
    for (const slug of ["bicep-curl", "hammer-curl"]) await runTool("add_exercise_to_day", { slug, sets: 3, reps: 10 }, { profileId: p.id });
    await runTool("start_workout", {}, { profileId: p.id });
    for (let i = 0; i < 3; i++) await runTool("log_set", { exerciseSlug: "bicep-curl", reps: 10, weight: 20 }, { profileId: p.id });

    const signIn = async (ctx: import("playwright").BrowserContext) => {
      const page = await ctx.newPage();
      page.on("response", (r) => { if (r.url().includes("/api/action") && r.status() >= 400) console.log("  action →", r.status()); });
      await page.goto(`${BASE}/login`, { waitUntil: "load" }); await page.waitForTimeout(600);
      await page.getByPlaceholder("Email").fill(EMAIL); await page.getByPlaceholder("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Enter" }).click();
      await page.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 30000 });
      return page;
    };

    // ── A. Phone, closed card in the day list ──────────────────────────
    {
      const page = await signIn(await browser.newContext({ ...devices["iPhone 14 Pro"], hasTouch: true }));
      await page.goto(`${BASE}/train`, { waitUntil: "load" }); await page.waitForTimeout(2500);
      const before = await count(p.id);
      const sq = page.getByRole("button", { name: /^Edit set 3:/ }).first();
      await sq.scrollIntoViewIfNeeded();
      const box = (await sq.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(700);
      const del = page.getByRole("button", { name: "Delete" });
      log("A closed card: Delete visible:", await del.count());
      if (await del.count() === 0) fails.push("A: no Delete after tapping a square on a closed card");
      else {
        await del.first().scrollIntoViewIfNeeded();
        const b = (await del.first().boundingBox())!;
        await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        await page.waitForTimeout(3500);
        const after = await count(p.id);
        log(`A: sets ${before} → ${after}`);
        if (after !== before - 1) fails.push(`A: closed-card delete did not remove a set (${before} → ${after})`);
      }
      await page.screenshot({ path: `${OUT}/a-phone.png` });
      await page.context().close();
    }

    // ── B. Desktop, lifted card; typing keeps focus; delete works ───────
    {
      const page = await signIn(await browser.newContext({ viewport: { width: 1280, height: 900 } }));
      await page.goto(`${BASE}/train`, { waitUntil: "load" }); await page.waitForTimeout(2500);
      await page.getByRole("link", { name: /^Log a set for Dumbbell Bicep/ }).first().click();
      await page.waitForTimeout(800);
      const dialogs = await page.locator('[role="dialog"]').count();
      log("B: lifted into a dialog:", dialogs);
      if (dialogs === 0) fails.push("B: desktop did not lift the card");

      // Focus while typing in the swap search, across the 2s marker tick.
      await page.getByRole("button", { name: /^Change what Dumbbell Bicep/ }).first().click();
      await page.waitForTimeout(400);
      const search = page.getByLabel("Search movements").first();
      await search.click();
      await search.type("ham", { delay: 120 });
      await page.waitForTimeout(4500);
      await search.type("mer", { delay: 120 });
      const active = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? "none");
      const value = await search.inputValue();
      log("B: after typing, focus on:", active, "| value:", JSON.stringify(value));
      if (active !== "Search movements") fails.push(`B: focus left the search box for "${active}"`);
      if (value !== "hammer") fails.push(`B: keystrokes lost — value is "${value}"`);

      // Delete a set from inside the lifted card.
      const before = await count(p.id);
      await page.getByRole("button", { name: /^Edit set 2:/ }).first().click();
      await page.waitForTimeout(500);
      const del = page.getByRole("button", { name: "Delete" });
      log("B: Delete visible:", await del.count());
      if (await del.count() === 0) fails.push("B: no Delete in the lifted card");
      else {
        await del.first().click(); await page.waitForTimeout(3500);
        const after = await count(p.id);
        log(`B: sets ${before} → ${after}`);
        if (after !== before - 1) fails.push(`B: lifted-card delete did not remove a set (${before} → ${after})`);
      }
      await page.screenshot({ path: `${OUT}/b-desktop.png` });
      await page.context().close();
    }
  } finally { await browser.close(); await db.delete(users).where(eq(users.id, u.id)); log("cleaned up"); }
  if (fails.length) { console.error("[delete2] FAILED", fails); process.exit(1); }
  log("OK"); process.exit(0);
}
main().catch((e) => { console.error("[delete2] FAILED", e); process.exit(1); });
