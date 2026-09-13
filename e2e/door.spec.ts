import { test as base, expect } from "@playwright/test";
import { dropAccount, makeAccount, type TestAccount } from "../tests/db/account";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { eq } from "drizzle-orm";

/**
 * The sign-in door, used properly — the one spec that does.
 *
 * Everything else mints its cookie, because typing at this door locks an
 * address out for an hour on a handful of failures and lands in the audit log
 * the owner's console reads. This one types, because the door is worth
 * testing and because it has been wrong in a way nothing else could catch:
 * two marquee assertions in tests/auth.test.ts destructured a four-part token
 * into two variables, so they verified a malformed string and passed for
 * years while checking nothing.
 *
 * It uses one address, once, with the right password — never a wrong one.
 * A run of failures here is a red alert on a live console.
 */
const test = base.extend<{ account: TestAccount }>({
  account: async ({}, run, testInfo) => {
    const a = await makeAccount(`door-${testInfo.project.name}`);
    try {
      await run(a);
    } finally {
      await dropAccount(a);
    }
  },
});

const PASSWORD = "a-long-probe-password-not-in-use-anywhere";

/*
  One browser, not two.

  The rate limit on this door is per address and per source, and it does not
  care which engine asked: running the same three specs twice tripped it and
  failed the second run, which is the door working exactly as designed. The
  door is server-side and has no layout, so a second browser would tell us
  nothing a first one did not — and would spend half of somebody's hourly
  allowance to say it.
*/
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the door is server-side; once is enough");
});

test("a closed door is closed @door", async ({ page }) => {
  // Deny by default: the proxy protects every route automatically, so a new
  // page is never public by having been forgotten.
  for (const path of ["/train", "/eat", "/progress", "/settings", "/admin"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
});

test("and it opens for the person who has the password @door", async ({ page, account }) => {
  await db.update(users)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(users.id, account.userId));

  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, account.userId));

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(row.email);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enter" }).click();

  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  // And she is actually somebody now, not merely past the form.
  await expect(page.getByText("Test").first()).toBeVisible();
});

test("the door says nothing about who exists @door", async ({ page }) => {
  /*
    Every failure returns the same flat message, with one written-down
    exception — an invited address with no password is told so, because the
    flat message locked a real invitee out for seven attempts before he found
    the Google button. That disclosure is in SECURITY.md.

    This checks the ordinary case: an address that is not here must look
    exactly like a wrong password, or the form is an oracle for "does this
    person have an account".
  */
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("nobody-at-all@probe.invalid");
  await page.getByPlaceholder("Password").fill("not-the-password-either");
  await page.getByRole("button", { name: "Enter" }).click();
  // Waited for rather than read once: a failure is announced, not just
  // coloured, so the text arrives when the round trip does.
  const alert = page.getByRole("alert").first();
  await expect(alert).toContainText(/\S/);
  const said = await alert.textContent();
  // It does not name the address, confirm it, or mention a password hash.
  expect(said).not.toMatch(/nobody-at-all|no account|not found|unknown/i);
});
