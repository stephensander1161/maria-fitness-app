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
export const test = base.extend<{ her: Signed; accountOptions: AccountOptions }>({
  /*
    What the account is made with, overridable per file or per describe block
    with `test.use({ accountOptions: { … } })`. The default is deliberately
    empty: UTC, metric, onboarded, which is what nearly every spec wants.
  */
  accountOptions: [{}, { option: true }],
  /*
    `run` rather than Playwright's usual `use`.

    The fixture's second argument is positional, so the name is free — and
    `use` is not free: the React hooks lint rule reads any call to something
    called `use()` as React's `use`, refuses it inside a try/catch, and fails
    the build. The try/finally is the point of this fixture.
  */
  her: async ({ context, accountOptions }, run, testInfo) => {
    const slug = `e2e-${testInfo.project.name}-${testInfo.title}`
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/-+$/, "");
    const signed = await signIn(context, slug, accountOptions);
    try {
      await run(signed);
    } finally {
      await dropAccount(signed.account);
    }
  },
});

export { expect } from "@playwright/test";

/**
 * A timezone in which it is, right now, the middle of her day.
 *
 * The morning weigh-in is offered from 05:00 until midnight **in her own
 * timezone**, and every test account is UTC. So a run that started between
 * midnight and five UTC rendered no prompt at all, and the three specs about
 * it passed while asserting nothing — one of them by finding `position:
 * fixed` absent on a page that was never pinned. A gate that runs before
 * every deploy cannot be a gate that only works in the afternoon.
 *
 * `Etc/GMT±N` are whole-hour offsets with no DST and no politics, so the hour
 * this picks is the hour the server will compute for the same instant. The
 * sign is POSIX's, which is inverted: `Etc/GMT+5` is UTC−5.
 */
export function daytimeZone(hour = 10): string {
  const utc = new Date().getUTCHours();
  const offset = ((hour - utc + 12 + 24) % 24) - 12; // −11…+12
  if (offset === 0) return "UTC";
  return `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}

/**
 * Put the full-screen prompts away.
 *
 * The morning weigh-in is a deliberate takeover on the first open of the day
 * and it will be over most of these specs. Dismissing it is what she does, so
 * doing the same here is not cheating — but a spec that is *about* it must
 * not call this.
 */
export async function clearMorningPrompt(page: Page) {
  /*
    Waited for, not glanced at.

    The prompt decides whether to show itself *after* mount — it reads what
    this browser remembers in a `requestAnimationFrame`, so on arrival it is
    reliably absent for a frame or two and then appears. A helper that asked
    once and moved on therefore skipped it about one run in ten, and the
    prompt would open a moment later.

    That is not a cosmetic race. `useDialog` pins the page while a dialog is
    open, so a spec that had already started scrolling found nothing would
    move and failed with "element is outside of the viewport" — a report that
    says nothing at all about the prompt that caused it.
  */
  const notToday = page.getByRole("button", { name: "Not today" });
  await notToday.first().waitFor({ state: "visible", timeout: 2_000 }).catch(() => {
    // Genuinely not this browser's first open of the day. Nothing to clear.
  });
  if (await notToday.count()) {
    await notToday.first().click();
    // Gone, rather than going: the pin is released on unmount.
    await notToday.first().waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
  }
}
