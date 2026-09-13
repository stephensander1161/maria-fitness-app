import { test, expect, clearMorningPrompt } from "./session";

/**
 * The numbers on Progress, read off the screen.
 *
 * This file exists because of a bug that got through everything else. The
 * page passed `current` — the EWMA trend — to the weigh-in row, which is the
 * one control on the screen that is about the *reading*. So a morning of
 * 181.2 was reported back as "Weighed in at 180.2", and tapping Update opened
 * a stepper on a number she had never entered, which then saves.
 *
 * Nothing below the screen could see it. `weightTrend` was right, `log_weight`
 * was right, the read model was right; a page handed one correct number to a
 * component expecting the other. That is only visible where the two appear
 * side by side, which is here.
 *
 * So these assert **rendered figures against rows that were written**, not
 * that a component exists.
 */
test.describe("the reading and the trend, side by side", () => {
  test("shows what the scale said, not the smoothed version of it", async ({ page, her }) => {
    // A run of steady mornings and then one that is clearly above them: the
    // trend lags on purpose, so the two numbers must differ.
    for (const [ago, kg] of [[6, 81.0], [5, 81.1], [4, 81.0], [3, 81.2], [2, 81.1], [1, 81.0]] as const) {
      const d = new Date(`${her.account.today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ago);
      await her.as("log_weight", { weight: kg, date: d.toISOString().slice(0, 10) });
    }
    await her.as("log_weight", { weight: 82.2 });

    await page.goto("/progress");
    await clearMorningPrompt(page);

    /*
      The row about today says today's reading, to the decimal.

      Matched on the sentence itself rather than on the section around it:
      `locator("section", { hasText })` resolves to the *outermost* section
      that contains the phrase, which on this page also contains the trend —
      so the assertion passed on the wrong number while the bug was in.
    */
    await expect(page.getByText(/^Weighed in at /)).toHaveText(/82\.2/);

    // The headline is the trend, and it is a different number — that is the
    // whole design, and it is also what made the bug invisible.
    const headline = page.getByText(/last weigh-in/).first();
    await expect(headline).toContainText("82.2");
    const trendText = await page.locator("section", { hasText: /TREND|Trend/ }).first().innerText();
    expect(trendText).toContain("82.2");
    const trendNumbers = [...trendText.matchAll(/\d+\.\d/g)].map((m) => m[0]);
    // At least two distinct figures on that card: the trend, and the reading
    // under it. If the page ever hands the row the trend again, they collapse.
    expect(new Set(trendNumbers).size).toBeGreaterThan(1);
  });

  test("the Update stepper opens on the reading she entered", async ({ page, her }) => {
    await her.as("log_weight", { weight: 79.4, date: shift(her.account.today, -2) });
    await her.as("log_weight", { weight: 83.6 });

    await page.goto("/progress");
    await clearMorningPrompt(page);
    await page.getByRole("button", { name: "Update" }).first().click();

    // Seeded from what she stood on the scale for. Seeded from the trend, this
    // stepper saves the app's guess over her actual weigh-in on the next tap.
    const field = page.getByRole("textbox").first();
    await expect(field).toHaveValue("83.6");
  });

  test("says nothing about a weekly rate it cannot support", async ({ page, her }) => {
    // One reading is not a trend. Five in a fortnight and one in three days,
    // or the screen refuses — a fortnightly weigher told she gained half a
    // kilo because she weighed in bloated is the failure this prevents.
    await her.as("log_weight", { weight: 80 });
    await page.goto("/progress");
    await clearMorningPrompt(page);
    const card = await page.locator("section", { hasText: /last weigh-in/ }).first().innerText();
    expect(card).not.toMatch(/this week/i);
  });
});

test.describe("food on Progress", () => {
  test("writes a floor rather than a total it does not have", async ({ page, her }) => {
    await her.as("log_meal", { slot: "breakfast", description: "oats", calories: 400, proteinG: 15 });
    await her.as("log_meal", { slot: "dinner", description: "out with friends" });

    await page.goto("/progress");
    await clearMorningPrompt(page);
    await expect(page.getByText(/≥/).first()).toBeVisible();
  });
});

test.describe("the empty screen still says something", () => {
  test("a brand new account gets sentences, not blank cards", async ({ page, her }) => {
    // "An empty state is not `return null`": a card that disappears is
    // indistinguishable from one that is broken, and she never learns the
    // feature exists.
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/progress");
    await clearMorningPrompt(page);
    const text = await page.locator("body").innerText();
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(/NaN|undefined|\[object Object\]/);
  });

  test("and no screen renders NaN out of a missing number", async ({ page, her }) => {
    expect(her.account.profileId).toBeTruthy();
    for (const path of ["/train", "/eat", "/plan", "/progress", "/kitchen"]) {
      await page.goto(path);
      await clearMorningPrompt(page);
      const text = await page.locator("body").innerText();
      expect(text, path).not.toMatch(/NaN|undefined|\[object Object\]/);
    }
  });
});

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
