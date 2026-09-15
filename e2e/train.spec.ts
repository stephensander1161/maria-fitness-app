import { test, expect, clearMorningPrompt } from "./session";

/**
 * A session, end to end.
 *
 * Every bug in this file's history was invisible to the type checker: a set
 * square that vanished when one refresh landed while another set was in
 * flight, a rest timer counting back down to a movement she had finished, a
 * marker ringed on a day nobody was training, and a rest day with no way off
 * it. All four shipped green.
 */
test.describe("training a day", () => {
  test.beforeEach(async ({ her }) => {
    await her.as("add_exercise_to_day", { slug: "bodyweight-squat", sets: 3, reps: 10 });
    await her.as("add_exercise_to_day", { slug: "dumbbell-row", sets: 3, reps: 10 });
  });

  test("shows the day's movements with their targets", async ({ page }) => {
    await page.goto("/train");
    await clearMorningPrompt(page);
    await expect(page.getByText("Bodyweight Squat").first()).toBeVisible();
    await expect(page.getByText("Dumbbell Row").first()).toBeVisible();
    await expect(page.getByText(/Target 3×10/).first()).toBeVisible();
  });

  test("the clock starts, runs, and signs the day off", async ({ page }) => {
    await page.goto("/train");
    await clearMorningPrompt(page);

    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(page.getByRole("button", { name: /Finish/ })).toBeVisible();

    /*
      Finish finishes. It used to stop and ask when movements were still on the
      plan — "Still to do: X. Finish anyway?" — and that question is gone: "i
      dont think i need a 'are you sure modal' that pops up to confirm i
      clicked it." The button is at the end of the session and it is the thing
      she reached for; the way back is `reopen_workout`, one tap away.
    */
    await page.getByRole("button", { name: /Finish/ }).click();
    await expect(page.getByRole("button", { name: "Yes, I'm done" })).toHaveCount(0);

    // The celebration takes the screen, and clearing it leaves a finished day
    // with the way back in on it.
    await expect(page.getByText("That’s the session")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Reopen this session" })).toBeVisible();
  });

  test("marks what she missed, and offers the session back", async ({ page, her }) => {
    await her.as("start_workout");
    await her.as("log_set", { exerciseSlug: "bodyweight-squat", reps: 10 });
    await her.as("finish_workout");

    await page.goto("/train");
    await clearMorningPrompt(page);
    await page.keyboard.press("Escape");

    // A finished day keeps its bar, with the way back in on it.
    await expect(page.getByText(/Finished/).first()).toBeVisible();
    const resume = page.getByRole("button", { name: "Reopen this session" });
    await expect(resume).toBeVisible();

    // Two of three squat sets and all three rows are missed, and they say so
    // rather than looking like work still waiting.
    await expect(page.locator('[class*="bg-miss-soft"]').first()).toBeVisible();

    await resume.click();
    await expect(page.getByRole("button", { name: /Finish/ })).toBeVisible();
    await expect(page.locator('[class*="bg-miss-soft"]')).toHaveCount(0);
  });

  test("no green marker on a day nobody is training", async ({ page }) => {
    await page.goto("/train");
    await clearMorningPrompt(page);
    // Before Start there is no session, so nothing is "the one you're on".
    await expect(page.locator(".now-glow")).toHaveCount(0);
  });
});

test.describe("stepping between days", () => {
  test("a rest day is not a dead end", async ({ page, her }) => {
    // The day's arrows used to live inside the one return a rest day never
    // reaches, so a Sunday showed a card saying "Rest day" and nothing else.
    const { today } = her.account;
    await page.goto(`/train?d=${today}`);
    await clearMorningPrompt(page);

    await expect(page.getByRole("link", { name: "The day before" })).toBeVisible();
    await expect(page.getByRole("link", { name: "The day after" })).toBeVisible();
  });

  test("carries the week's movements into the next one", async ({ page, her }) => {
    await her.as("add_exercise_to_day", { slug: "hip-thrust", sets: 3, reps: 10, dayOfWeek: 0 });

    // Monday of the week after hers. The plan rolls itself forward on the
    // first view, so the movements are waiting rather than needing rebuilding.
    const nextMonday = new Date(`${her.account.week}T00:00:00Z`);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    await page.goto(`/train?d=${nextMonday.toISOString().slice(0, 10)}`);
    await clearMorningPrompt(page);

    await expect(page.getByText("Barbell Hip Thrust").first()).toBeVisible();
  });
});

test.describe("logging a set", () => {
  test("the Log button is never behind the tab bar", async ({ page, her }, testInfo) => {
    // Phone only: the bar is `md:hidden`, so on a desktop there is nothing
    // for it to be behind and the question does not arise.
    test.skip(testInfo.project.name !== "phone", "no tab bar above md");
    /*
      Found by this suite on its first run, and it had shipped.

      `html` is `overflow: hidden` — this is an app shell, not a document —
      so a card sized at 86dvh on a movement's own page ended twenty-eight
      pixels inside the tab bar, with nothing to scroll and no way to get the
      primary control of the screen clear of it. A sheet can ignore the bar
      because it is lifted over it; a card that *is* the screen cannot.
    */
    await her.as("add_exercise_to_day", { slug: "bodyweight-squat", sets: 3, reps: 10 });
    await page.goto("/train/bodyweight-squat");
    await clearMorningPrompt(page);

    const clearance = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")]
        .find((b) => /^Log set \d+$/.test(b.textContent ?? ""));
      const nav = document.querySelector("nav.fixed");
      if (!btn || !nav) return null;
      return Math.round(nav.getBoundingClientRect().top - btn.getBoundingClientRect().bottom);
    });
    expect(clearance).not.toBeNull();
    expect(clearance!).toBeGreaterThanOrEqual(0);
  });

  test("the square lands on the tap and survives the refresh", async ({ page, her }) => {
    /*
      The regression that came back twice.

      The square goes in optimistically and `router.refresh()` reconciles
      behind it. The first version threw the whole optimistic list away the
      moment the server's count moved, which is right for one set in flight
      and wrong for two — so logging three quickly showed two.
    */
    await her.as("add_exercise_to_day", { slug: "bodyweight-squat", sets: 3, reps: 10 });
    await her.as("start_workout");
    await page.goto("/train/bodyweight-squat");
    await clearMorningPrompt(page);

    for (let i = 0; i < 3; i++) {
      const log = page.getByRole("button", { name: /^Log set \d+$/ }).last();
      await expect(log).toHaveText(new RegExp(`Log set ${i + 1}`));
      await log.click();
    }
    // Three, counted the whole way — never two, at any point in between.
    await expect(page.getByRole("button", { name: /^Log set \d+$/ }).last())
      .toHaveText(/Log set 4/);

    // Three squares, three sets — not two, and not at any point in between.
    await page.goto("/train");
    await clearMorningPrompt(page);
    await expect(page.getByText(/Still to do/)).toHaveCount(0);
  });
});
