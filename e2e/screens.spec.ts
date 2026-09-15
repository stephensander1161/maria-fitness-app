import { test, expect, clearMorningPrompt, daytimeZone } from "./session";

/**
 * The rest of the screens, asserted the way Progress is: **rendered figures
 * against rows that were written.**
 *
 * That distinction is the whole point of this file. A spec that checks a
 * component is on the page catches a deleted import; it does not catch a page
 * handing one correct number to a component expecting a different one, which
 * is what put the trend where the weigh-in belonged. So everything here
 * writes a row through the registry, opens the screen, and reads the figure
 * back off it.
 */

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

test.describe("Plan", () => {
  test("puts each movement on the day it was written to", async ({ page, her }) => {
    // Monday and Wednesday, so a day mix-up is visible rather than plausible.
    // Plan shows the week as a strip and one day in full, so this reads both:
    // the strip for where the work is, the card for what it is.
    await her.as("add_exercise_to_day", { slug: "barbell-back-squat", sets: 4, reps: 5, dayOfWeek: 0 });
    await her.as("add_exercise_to_day", { slug: "dumbbell-row", sets: 3, reps: 12, dayOfWeek: 2 });

    // `day=0` explicitly. Plan opens on today, so "Monday is open" was only
    // true on a Monday, and the two assertions below it read whichever day
    // the run happened to land on.
    await page.goto("/plan?day=0");
    await clearMorningPrompt(page);

    // Two days with work on them, five rest days — not seven of either.
    /*
      Matched on where each one goes, not on what it says.

      `hasText` compares against `textContent`, which — unlike `innerText` —
      inserts no whitespace between block elements, so "MON" and "14" arrive
      joined and a regex written from what the screen looks like does not
      match. The day strip's links carry `day=N`, which is the thing actually
      being asserted anyway: seven days, each pointing at its own.
    */
    const dayLink = (n: number) =>
      page.getByRole("link", { name: new RegExp(`^${WEEKDAYS[n]} the \\d+`) });
    // One link per day, and each one says what is on that day. Matched on the
    // accessible name rather than the href, because the tabs and all three
    // week arrows carry `day=` as well — and the arrows carry *today's*
    // index, so `a[href*="day=1&"]` picked the next-week arrow instead of
    // Tuesday on any run that happened on a Tuesday. That is the kind of gate
    // that passes six days in seven.
    for (let n = 0; n < 7; n++) await expect(dayLink(n), `day ${n}`).toBeVisible();

    const days = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((n) => dayLink(n).innerText()));
    // Two with work on them, five rest — not seven of either.
    expect(days.filter((d) => /Rest/.test(d))).toHaveLength(5);
    expect(days[0]).not.toMatch(/Rest/);
    expect(days[2]).not.toMatch(/Rest/);

    // Monday is open, with its target exactly as written.
    await expect(page.getByText("Barbell Back Squat").first()).toBeVisible();
    await expect(page.getByText(/Target 4\s*[×x]\s*5/).first()).toBeVisible();

    // …and Wednesday's movement is on Wednesday, not on Monday with it.
    await expect(page.getByText("Dumbbell Row")).toHaveCount(0);
    await dayLink(2).click();
    await expect(page.getByText("Dumbbell Row").first()).toBeVisible();
    await expect(page.getByText(/Target 3\s*[×x]\s*12/).first()).toBeVisible();
  });

  test("counts a session as done from the work, not from a button", async ({ page, her }) => {
    // `workoutHappened` is the one predicate: completed_at, or any set logged.
    // Two counters disagreeing about one week is worse than either being
    // wrong, which is why it is one predicate and not three.
    await her.as("add_exercise_to_day", { slug: "bodyweight-squat", sets: 3, reps: 10, dayOfWeek: 0 });
    await her.as("log_set", { exerciseSlug: "bodyweight-squat", reps: 10, date: monday(her.account.week) });

    await page.goto("/plan");
    await clearMorningPrompt(page);
    const body = await page.locator("body").innerText();
    // Never "0 of" while a set is logged against the week.
    expect(body).not.toMatch(/\b0 of \d/);
  });

  test("steps to next week and the programme repeats", async ({ page, her }) => {
    // `?w=` moves a week at a time, and the plan rolls itself forward on the
    // first view — so next Monday is last Monday's session, not an empty page.
    await her.as("add_exercise_to_day", { slug: "hip-thrust", sets: 3, reps: 10, dayOfWeek: 0 });

    const next = shift(her.account.week, 7);
    // `day=0` explicitly: without it Plan opens on today's index, and on any
    // day but Monday that is a rest day with no movement on it to find.
    await page.goto(`/plan?w=${next}&day=0`);
    await clearMorningPrompt(page);

    await expect(page.getByText(/Next week/i).first()).toBeVisible();
    await expect(page.getByText("Barbell Hip Thrust").first()).toBeVisible();
  });
});

test.describe("Kitchen", () => {
  test("shows an amount as an amount, and an uncounted line as 'some'", async ({ page, her }) => {
    /*
      Four states a boolean would flatten into two: an amount, `null` for "she
      has some, nobody counted it", `0` for known to be out, and no row at all
      for never bought. Only *out*, *short* and *missing* mean buy it — and
      "some" must never read as enough.
    */
    await her.as("add_to_pantry", { items: [{ item: "rice", amount: 500, unit: "g" }] });
    await her.as("add_to_pantry", { items: [{ item: "olive oil" }] });
    await her.as("set_pantry_item", { item: "tinned tomatoes", amount: 0 });

    await page.goto("/kitchen");
    await clearMorningPrompt(page);
    // Waited for rather than read once: the page is force-dynamic, so reading
    // `innerText` on arrival reads whatever had painted by then.
    await expect(page.getByText("rice").first()).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/500\s*g/);
    // The uncounted one says so in words rather than showing a number. "Some"
    // must never read as enough, and it must never read as a quantity.
    expect(body).toContain("olive oil");
    expect(body.toLowerCase()).toMatch(/\bsome\b/);
    // And out is out, never zero-of-something dressed up as an amount.
    expect(body.toLowerCase()).toMatch(/\bout\b/);
  });

  test("adds six eggs to six rather than opening a second line", async ({ page, her }) => {
    // "4 eggs plus 2 eggs" is six eggs, never 300g. The unit column stores ""
    // rather than NULL because Postgres never considers two NULLs equal, and
    // a second row is what that mistake looks like on this screen.
    await her.as("add_to_pantry", { items: [{ item: "eggs", amount: 6 }] });
    await her.as("add_to_pantry", { items: [{ item: "eggs", amount: 6 }] });

    await page.goto("/kitchen");
    await clearMorningPrompt(page);
    await expect(page.getByText(/^egg$/).first()).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/\b12\b/);
    // One line, not two. A second row is what the NULL-unit mistake looks
    // like on this screen.
    expect(await page.getByText(/^egg$/).count()).toBe(1);
  });
});

test.describe("the coach sheet", () => {
  test("opens from the furniture on every screen, and draws no button of its own",
    async ({ page, her }) => {
      /*
        The sheet was written, exported and never mounted: for months the
        companion dispatched `coach:open` into an empty room and tapping him
        did nothing on every screen in the app. Nothing caught it, because the
        test that had asserted the mount was deleted with the button it used
        to describe.
      */
      expect(her.account.profileId).toBeTruthy();
      for (const path of ["/train", "/eat", "/progress"]) {
        await page.goto(path);
        await clearMorningPrompt(page);
        const ask = page.getByRole("button", { name: /ask|coach/i }).first();
        await expect(ask, path).toBeVisible();
        await ask.click();
        // A real dialog: it says it is one, and Escape closes it.
        const sheet = page.locator('[role="dialog"]').first();
        await expect(sheet, path).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet, path).toHaveCount(0);
      }
    });

  test("keeps the composer outside the scroller", async ({ page, her }) => {
    // The tab version grew the page under a fixed composer and the newest
    // message sat behind it — she had to scroll down to read the answer she
    // had just been given.
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/train");
    await clearMorningPrompt(page);
    await page.getByRole("button", { name: /ask|coach/i }).first().click();

    const clear = await page.evaluate(() => {
      // The composer is an `<input>` with a label of its own — see
      // components/coach-thread.tsx.
      const box = document.querySelector('[role="dialog"] [aria-label="Message your coach"]');
      const dialog = document.querySelector('[role="dialog"]');
      if (!box || !dialog) return null;
      const b = box.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      // Inside the sheet, and fully on screen rather than under anything.
      return { insideSheet: b.bottom <= d.bottom + 1, onScreen: b.bottom <= window.innerHeight + 1 };
    });
    expect(clear).not.toBeNull();
    expect(clear!.insideSheet).toBe(true);
    expect(clear!.onScreen).toBe(true);
  });
});

test.describe("Friends", () => {
  test("hands out a code and says what it does not grant", async ({ page, her }) => {
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/friends");
    await clearMorningPrompt(page);
    await expect(page.getByText(/[0-9A-Z]{4}-[0-9A-Z]{4}/).first()).toBeVisible();
    const body = await page.locator("body").innerText();
    // Found by code, never by email: an email lookup would make any signed-in
    // account an oracle for "does this address have an account", and the
    // address lives on `users`, which is out of the model's reach entirely.
    expect(body).not.toContain("@probe.invalid");
    expect(body.toLowerCase()).toContain("not your email");
  });

  test("shows nothing of anybody's body, even with rows to leak", async ({ page, her }) => {
    await her.as("log_weight", { weight: 77.7 });
    await her.as("log_measurement", { measurements: [{ site: "waist", value: 88 }] });
    await page.goto("/friends");
    await clearMorningPrompt(page);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("77.7");
    expect(body).not.toContain("88");
  });
});

test.describe("the page behind a dialog", () => {
  /*
    An account for whom it is mid-morning, whatever time it is here.

    The morning weigh-in is offered from 05:00 in *her* timezone and every
    test account is UTC, so between midnight and five UTC there was no prompt
    to pin anything — and this spec passed by finding a page that had never
    been pinned. See `daytimeZone`.
  */
  test.use({ accountOptions: { timezone: daytimeZone() } });

  /*
    A dialog pins the page while it is open, so a thumb dragging on the sheet
    does not scroll the screen underneath — the same "inert" lie the focus
    trap exists to stop, by touch.

    It has to *un*pin. `useDialog` used to pin on mount rather than on open,
    and `WeighInPrompt` is mounted in the root layout every day until she
    weighs in and renders nothing until it has read what this browser
    remembers. So on any morning before her weigh-in the whole app could not
    scroll — not the prompt, the app — and dismissing it did not help, because
    the pin was tied to the component being mounted. Settings below the fold
    was unreachable.
  */
  const pinned = (page: import("@playwright/test").Page) =>
    page.evaluate(() => getComputedStyle(document.body).position === "fixed");

  test("is pinned while the morning prompt is up and released the moment it goes",
    async ({ page, her }) => {
      expect(her.account.profileId).toBeTruthy();
      await page.goto("/settings");
      await expect(page.getByRole("button", { name: "Not today" })).toBeVisible();
      expect(await pinned(page), "pinned while it is up").toBe(true);

      await clearMorningPrompt(page);
      expect(await pinned(page), "released on dismiss").toBe(false);

      // And it stays released across a navigation, because the gate keeps
      // rendering the component until she actually weighs in.
      await page.goto("/train");
      await page.waitForTimeout(500);
      expect(await pinned(page), "still released after navigating").toBe(false);
    });

  test("never pins when there is no prompt to show", async ({ page, her }) => {
    await her.as("log_weight", { weight: 70 });
    await her.as("log_sleep", { howLong: "8h" });
    await page.goto("/settings");
    await page.waitForTimeout(800);
    expect(await pinned(page)).toBe(false);
  });

  test("lets Settings reach its own bottom on a phone", async ({ page, her }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "the desktop pane scrolls separately");
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/settings");
    await clearMorningPrompt(page);
    // The last card on the page. Unreachable while the body was pinned.
    const last = page.getByRole("heading", { name: /Delete your account/i }).first();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
});

test.describe("Settings", () => {
  test("changes which plate the app wears", async ({ page, her }) => {
    /*
      A plate is the thing on the end of a bar and the thing dinner is on —
      that is why the app is called Plate. A pauldron is the third kind.

      This also covers the bug the picker itself exposed: the gradient id was
      derived from the mark's name on the reasoning that two instances of the
      same mark define the same gradient, so whichever resolved first was
      right. It is not, when the first one is inside the sidebar — which is
      `display: none` below `md`, and a paint server in a hidden SVG resolves
      to nothing. The barbell option rendered with no badge while the pauldron
      beside it, the only one of its name on the page, rendered fine.
    */
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/settings");
    await clearMorningPrompt(page);
    // The card is a long way down a long page; wait for it, and bring it into
    // view, before asking anything about it.
    const shoulder = page.getByRole("button", { name: /Shoulder plate/i });
    await expect(shoulder).toBeVisible();
    await shoulder.scrollIntoViewIfNeeded();

    // Both options paint their badge. `<rect>` with no resolvable fill is
    // still in the DOM, so this asks for the fill the browser actually used.
    const painted = await page.evaluate(() => {
      // Scoped to the Mark card: the theme picker's swatches are
      // `aria-pressed` buttons too, and they are not marks.
      const card = [...document.querySelectorAll("section")]
        .find((s) => s.querySelector("h2")?.textContent === "Mark");
      /*
        The *badge* rect of each option, which is the first one in its svg.
        Some marks are drawn from rects too — the plate stack is three of them
        — and those share the on-accent fill by design, so counting every rect
        compares the drawing with the badge.
      */
      const badges = [...(card?.querySelectorAll("button[aria-pressed] svg") ?? [])]
        .map((svg) => svg.querySelector("rect"))
        .filter((r): r is SVGRectElement => r !== null);
      return badges.map((r) => getComputedStyle(r).fill);
    });
    expect(painted.length).toBeGreaterThanOrEqual(2);
    for (const fill of painted) expect(fill).not.toBe("none");
    expect(new Set(painted.map((f) => f.replace(/["']/g, ""))).size).toBe(painted.length);

    await shoulder.click();
    // The tick moves on the tap; the row is written a moment later. Both
    // matter, and only the first is instant — every option is disabled while
    // the call is in flight, so waiting for them to come back is waiting for
    // the write. Reloading before that is a race the test would lose
    // sometimes and the app never would.
    await expect(shoulder).toHaveAttribute("aria-pressed", "true");
    await expect(shoulder).toBeEnabled();

    // It follows the account, so it is still there on the next screen.
    await page.reload();
    await clearMorningPrompt(page);
    await expect(page.getByRole("button", { name: /Shoulder plate/i }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("changes the theme and the screen comes back in it", async ({ page, her }) => {
    // Stamped on <html> by the server, so the first paint is already right —
    // a script that reads localStorage after load is how a light-mode user
    // gets a black flash on every navigation.
    expect(her.account.profileId).toBeTruthy();
    await page.goto("/settings");
    await clearMorningPrompt(page);

    const before = await page.getAttribute("html", "data-theme");
    const pick = page.getByRole("button", { name: /daylight/i }).first();
    if (await pick.count()) {
      await pick.click();
      await expect.poll(() => page.getAttribute("html", "data-theme")).not.toBe(before);
      await page.reload();
      expect(await page.getAttribute("html", "data-theme")).not.toBe(before);
    }
  });
});

function monday(week: string): string {
  return week;
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
