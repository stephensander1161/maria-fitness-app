import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { runTool } from "@/lib/tools";
import { makeAccount, dropAccount, type AccountOptions, type TestAccount } from "../tests/db/account";

/**
 * A signed-in browser, on an account that exists only for this spec.
 *
 * The cookie is minted from `AUTH_SECRET` rather than typed into the sign-in
 * form, and that is a correctness decision rather than a shortcut. The door
 * locks an address out for an hour after a handful of failures, so a flaky
 * spec would take the next run down with it — and `npm run dev` points at the
 * production database, so a run of probe sign-ins lands in the same audit log
 * the owner's console reads. It has raised a red alert before, over four
 * mistyped passwords that turned out to be somebody's father.
 *
 * e2e/sign-in.spec.ts uses the real door, deliberately and once.
 */
export type Signed = {
  account: TestAccount;
  /** Run a tool as her — for arranging the state a spec needs. */
  as: (tool: string, input?: Record<string, unknown>) => Promise<unknown>;
};

export async function signIn(
  context: BrowserContext,
  slug: string,
  options: AccountOptions = {},
): Promise<Signed> {
  const account = await makeAccount(slug, options);
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("e2e needs AUTH_SECRET — run it as `npm run test:e2e`, which loads .env");

  const token = await createSessionToken(secret, account.userId);
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: token,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  }]);

  return {
    account,
    as: (tool, input = {}) => runTool(tool, input, account.ctx),
  };
}

/**
 * The fixture most specs want: an account, signed in, dropped afterwards
 * whether the spec passed or not.
 *
 * `use` is wrapped in a try/finally rather than relying on the spec to tidy
 * up, because the one time it matters is the time the spec threw.
 */
export const test = base.extend<{ her: Signed }>({
  her: async ({ context }, use, testInfo) => {
    const slug = `e2e-${testInfo.project.name}-${testInfo.title}`
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/-+$/, "");
    const signed = await signIn(context, slug);
    try {
      await use(signed);
    } finally {
      await dropAccount(signed.account);
    }
  },
});

export { expect } from "@playwright/test";

/**
 * Put the full-screen prompts away.
 *
 * The morning weigh-in is a deliberate takeover on the first open of the day
 * and it will be over most of these specs. Dismissing it is what she does, so
 * doing the same here is not cheating — but a spec that is *about* it must
 * not call this.
 */
export async function clearMorningPrompt(page: Page) {
  const notToday = page.getByRole("button", { name: "Not today" });
  if (await notToday.count()) await notToday.first().click();
  await page.waitForTimeout(200);
}
