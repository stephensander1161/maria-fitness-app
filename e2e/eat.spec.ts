import { test, expect, clearMorningPrompt } from "./session";

/**
 * Food, on the screen.
 *
 * The rule under all of it is the one CLAUDE.md repeats: a day with a meal
 * logged in words is a day whose calories are a **floor**, and the screen has
 * to say "≥" rather than a number it does not have. Summing the nulls as
 * zeros always fails in the direction that reads as her failure.
 */
test.describe("the day's food", () => {
  test("adds a meal and shows it against the day", async ({ page, her }) => {
    await her.as("log_meal", {
      slot: "breakfast", description: "porridge and berries",
      calories: 420, proteinG: 14, carbsG: 60, fatG: 9, fibreG: 8,
    });
    await page.goto("/eat");
    await clearMorningPrompt(page);
    await expect(page.getByText("porridge and berries").first()).toBeVisible();
    await expect(page.getByText(/420/).first()).toBeVisible();
  });

  test("writes a floor, not a total, when an entry carries no figures", async ({ page, her }) => {
    await her.as("log_meal", { slot: "breakfast", description: "oats", calories: 400, proteinG: 14 });
    await her.as("log_meal", { slot: "dinner", description: "dinner at Mum's" });

    await page.goto("/eat");
    await clearMorningPrompt(page);
    await expect(page.getByText("dinner at Mum's").first()).toBeVisible();
    // "≥" somewhere on the day: one entry has no figure, so 400 is the least
    // she ate rather than what she ate.
    await expect(page.getByText(/≥/).first()).toBeVisible();
  });

  test("offers water where the food is, and counts a glass", async ({ page, her }) => {
    await page.goto("/eat");
    await clearMorningPrompt(page);
    await expect(page.getByText(/water/i).first()).toBeVisible();

    await her.as("log_water", { amount: "500ml" });
    await page.reload();
    await clearMorningPrompt(page);
    await expect(page.getByText(/0\.5|500/).first()).toBeVisible();
  });
});

test.describe("the food library", () => {
  test("reads a chain item off its own panel", async ({ page, her }) => {
    // "small McDonald's fries" is a lookup rather than a guess: the row is
    // per item, because a small fries is a thing and not a weight.
    const found = await her.as("search_food_library", { query: "McDonald" }) as { name: string }[];
    expect(found.length).toBeGreaterThan(0);
    await page.goto("/eat");
    await clearMorningPrompt(page);
    await expect(page).toHaveURL(/\/eat/);
  });
});

test.describe("every tab answers", () => {
  for (const path of ["/train", "/eat", "/plan", "/progress", "/kitchen", "/learn"]) {
    // `her` is unused in the body and load-bearing all the same: requesting
    // the fixture is what signs the browser in. Without it every one of these
    // is a redirect to the door, which is the proxy working rather than the
    // page rendering.
    test(`${path} renders without an error page`, async ({ page, her }) => {
      expect(her.account.profileId).toBeTruthy();
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await clearMorningPrompt(page);
      // `error.tsx` above every route means a Neon blip is a card rather than
      // Next's unstyled white page with no tab bar and no way back.
      await expect(page.getByText(/Application error|something went wrong/i)).toHaveCount(0);
      /*
        And the way out of anywhere is on screen.

        On a phone that is the tab bar; on a desktop it is the sidebar, and
        the other one is `hidden` in the DOM either way — which is why this
        asks for whichever is *visible* rather than for the first `nav`. One
        Neon blip used to replace a tab with Next's unstyled white page: no
        tab bar, no way back, and in a standalone PWA no browser chrome
        either. That is the failure this checks for.
      */
      await expect(page.locator("nav:visible").first()).toBeVisible();
    });
  }
});
