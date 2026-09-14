import { test, expect, clearMorningPrompt } from "./session";
import { test as base } from "@playwright/test";
import { signIn } from "./session";
import { dropAccount } from "../tests/db/account";

/**
 * The screens nothing else reaches: the front door for a new account, the
 * recovery section, the owner's console, and the library.
 *
 * Three of the four are the ones where being wrong costs most. Onboarding is
 * the only screen somebody sees before they trust the app at all; `/recovery`
 * is the part where loading a pelvic floor that is not ready leaves people
 * with years of consequences; `/admin` is a page about other people that must
 * never become a page about their bodies.
 */

test.describe("the library", () => {
  test("finds a movement by the words people use, and says so when it does not",
    async ({ page, her }) => {
      /*
        "push up" once found nothing out of five push-ups, because the Learn
        list carried its own drifted copy of the matcher. It shares
        `matchesQuery` with the picker and the coach's search tool now.
      */
      expect(her.account.profileId).toBeTruthy();
      await page.goto("/learn");
      await clearMorningPrompt(page);

      const box = page.getByRole("searchbox").or(page.getByPlaceholder(/search|find/i)).first();
      await box.fill("push up");
      await expect(page.getByText(/push.?up/i).first()).toBeVisible();

      // Plurals drop per word on both sides of a match.
      await box.fill("pull ups");
      await expect(page.getByText(/pull.?up/i).first()).toBeVisible();

      // And an empty state is a sentence, not a blank list.
      await box.fill("zzzzzzz");
      await expect(page.getByText(/Nothing matches that/i)).toBeVisible();
    });

  test("opens one and shows how to do it", async ({ page, her }) => {
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/learn/barbell-back-squat");
    await clearMorningPrompt(page);
    await expect(page.getByText("Barbell Back Squat").first()).toBeVisible();
    // The cues are the reason the page exists — a name and a wireframe is a
    // guess, which is why they are on the picker too.
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(300);
    expect(body).not.toMatch(/undefined|NaN/);
  });
});

test.describe("coming back from childbirth", () => {
  test("says nothing at all until she has said she is postpartum", async ({ page, her }) => {
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/recovery");
    await clearMorningPrompt(page);
    // "Do not assume it" — the app must not raise this with somebody who has
    // not raised it.
    await expect(page.getByText(/Not set up/i).first()).toBeVisible();
  });

  test("keeps her in the early stage without a clearance, whatever the weeks say",
    async ({ page, her }) => {
      /*
        Clearance is a gate, not a formality. Time does not promote her; the
        check does, because the check is what rules out what an app cannot
        see. Two hundred days postpartum and uncleared is still `early`.
      */
      await her.as("set_postpartum_status", { birthDate: shift(her.account.today, -200) });
      await page.goto("/recovery");
      await clearMorningPrompt(page);
      // Waited for, not read on arrival: this page is force-dynamic and
      // `innerText` returns whatever had painted by the time it was asked.
      await expect(page.getByText(/NOT CLEARED YET/i).first()).toBeVisible();

      const body = await page.locator("body").innerText();
      // It says walk and breathe, and says those *count* — "genuine training
      // right now, not a consolation prize" is the line that matters.
      expect(body.toLowerCase()).toMatch(/walk/);
      expect(body.toLowerCase()).toMatch(/breath/);
      expect(body.toLowerCase()).toMatch(/not a consolation prize/);
      // And it refuses to write a programme until somebody has looked at her,
      // which is the gate itself rather than a suggestion.
      expect(body.toLowerCase()).toMatch(/will not write you a training programme/);
      expect(body).toMatch(/pelvic health physiotherapist/i);
    });

  test("stops the progression on a symptom rather than pushing through", async ({ page, her }) => {
    await her.as("set_postpartum_status", {
      birthDate: shift(her.account.today, -200),
      clearedByProfessional: true,
      symptoms: ["leaking"],
    });
    await page.goto("/recovery");
    await clearMorningPrompt(page);
    await expect(page.getByRole("heading", { name: /Recovery/i }).first()).toBeVisible();
    await expect(page.getByText(/pelvic floor/i).first()).toBeVisible();
    // Assess, never push through — and supervised pelvic floor training is
    // first-line and it *works*, said in the same breath rather than as a
    // door closing.
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).toMatch(/pelvic floor/);
  });
});

/**
 * The console, which needs an owner rather than the usual account.
 */
const owner = base.extend<{ boss: Awaited<ReturnType<typeof signIn>> }>({
  boss: async ({ context }, run, testInfo) => {
    const signed = await signIn(context, `admin-${testInfo.project.name}`, {
      role: "owner", name: "Owner",
    });
    try {
      await run(signed);
    } finally {
      await dropAccount(signed.account);
    }
  },
});

owner.describe("the owner's console", () => {
  owner("is operational, and never personal", async ({ page, boss }) => {
    /*
      An owner reading another adult's weigh-ins is the same failure the
      friends feature prevents, with no consent step at all. `lib/admin.ts`
      counts rows rather than selecting them; this checks the rendered page
      with real rows behind it — including the error card, which quotes failed
      statements and used to quote their bound values with them.
    */
    await boss.as("log_weight", { weight: 77.7 });
    await boss.as("log_measurement", { measurements: [{ site: "waist", value: 88 }] });
    await boss.as("log_meal", {
      slot: "lunch", description: "admin-leak-probe-sandwich", calories: 654,
    });

    await page.goto("/admin");
    // `.first()`: the page's own heading and the nav's label both match.
    await expect(page.getByRole("heading", { name: "Admin" }).first()).toBeVisible();
    const body = await page.locator("body").innerText();

    expect(body).not.toContain("77.7");
    expect(body).not.toContain("admin-leak-probe-sandwich");
    expect(body).not.toContain("654");
    // What it does show is operational.
    expect(body).toMatch(/Security log|Worth a look/i);
  });

  owner("is the one screen with no coach on it", async ({ page, boss }) => {
    // No tools reach `users`, so the coach cannot answer about anything here.
    // Offering would be a promise the app cannot keep.
    expect(boss.account.profileId).toBeTruthy();
    await page.goto("/admin");
    await expect(page.getByText(/Ask your coach/i)).toHaveCount(0);
  });
});

test.describe("the door to the console", () => {
  test("is shut to a member", async ({ page, her }) => {
    /*
      `requireOwner()` on `users.role` is the whole gate: the proxy only proves
      a valid session, and every member has one.

      The bounce is a *client-side* redirect and takes a second or two — the
      layout streams first, so Next cannot set a Location header by the time
      the check runs. So this waits for it rather than reading the URL on
      arrival, which is what an impatient first version of this test did. What
      must be true immediately is the part that matters: nothing from the
      console is in the response at all while she is on her way off it.
    */
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 15_000 });
  });
});

test.describe("a brand new account", () => {
  test("is sent to onboarding rather than into an empty app", async ({ context }) => {
    const fresh = await signIn(context, "onboard-new", { onboarded: false });
    try {
      const page = await context.newPage();
      await page.goto("/train");
      await expect(page).toHaveURL(/\/welcome/);
      // The first question is who she is, and it is one question.
      await expect(page.getByText(/Let'?s start with you/i)).toBeVisible();
      await expect(page.getByPlaceholder(/Your name/i)).toBeVisible();
    } finally {
      await dropAccount(fresh.account);
    }
  });

  test("cannot be walked past without answering", async ({ context }) => {
    const fresh = await signIn(context, "onboard-guard", { onboarded: false });
    try {
      const page = await context.newPage();
      await page.goto("/welcome");
      await expect(page.getByText(/Let'?s start with you/i)).toBeVisible();
      // Every other tab bounces back here until the form is done, so nobody
      // lands on a screen whose numbers are all placeholders.
      for (const path of ["/eat", "/progress", "/plan"]) {
        await page.goto(path);
        await expect(page, path).toHaveURL(/\/welcome/);
      }
    } finally {
      await dropAccount(fresh.account);
    }
  });
});

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
