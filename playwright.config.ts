import { defineConfig, devices } from "@playwright/test";

/**
 * The journeys, in a real browser.
 *
 * Everything below this file is a unit or a query. This is the layer that has
 * caught the bugs neither could: the chat sheet mounted nowhere for months
 * while the companion dispatched `coach:open` into an empty room; a set
 * square that vanished when a refresh landed while another was in flight; a
 * rest day with no way off it, because the day's arrows were written inside
 * the one return that a rest day never reaches. Each of those passed the type
 * checker, the linter and every test in the repository.
 *
 * Two rules, and they are the probe rules from CLAUDE.md:
 *
 * 1. **No real rows, ever.** Each spec makes a throwaway account through
 *    tests/db/account.ts and drops it afterwards. An overnight probe once
 *    overwrote the real profile and the coach greeted the wrong person for a
 *    day.
 * 2. **No typing at the sign-in door.** The session cookie is minted from
 *    `AUTH_SECRET` directly (e2e/session.ts). The door rate-limits to an hour
 *    after a handful of failures, and — because `npm run dev` points at the
 *    production database — a run of probe sign-ins shows up on the owner's
 *    console as a real burst. One spec signs in properly, on purpose, because
 *    that door is worth testing; it is the only one.
 *
 * It runs against `next start` on a port of its own, so it never fights the
 * dev server somebody has open, and the build is the one that is about to be
 * deployed rather than a dev-mode approximation of it.
 */
const PORT = 3311;

export default defineConfig({
  testDir: "e2e",
  // The suite shares one database. Parallel files would race on nothing —
  // every account is its own — but Neon's connection ceiling is real.
  workers: 2,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  /*
    The sign-in door is held back from the default run.

    Its rate limit is per address and per source and it locks out for an hour,
    which is correct for a door and wrong for a gate that runs on every
    deploy: three real attempts is most of the allowance, and the second run
    in an hour fails for the reason the door exists. So those specs are tagged
    `@door` and excluded unless `E2E_DOOR=1` — `npm run test:e2e:door`. They
    are worth running before anything touching lib/auth.ts or the proxy, and
    not worth running fifteen times an afternoon.
  */
  grepInvert: process.env.E2E_DOOR ? undefined : /@door/,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // On a failure, the thing worth having is what the screen looked like.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "phone",
      /*
        The iPhone's metrics on Chromium, rather than WebKit.

        This app is used on a phone, so the viewport, the touch handling and
        the device pixel ratio are the parts that matter and those are what
        the descriptor carries. WebKit would be the more faithful engine and
        it is another 100MB of browser to install on every machine and every
        CI runner for a gate that has to run before every deploy. The layout
        bugs this catches — a control below the fold, a sheet behind the tab
        bar, a prompt that clips its own top — are engine-independent.
      */
      use: { ...devices["iPhone 14 Pro"], browserName: "chromium" },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    // The built app, not `next dev`: this is the artefact being shipped, and
    // dev mode's compile-on-first-request makes every first navigation look
    // like a five-second page.
    // `.env.test` for the served app too: Next reads `.env` itself, and the
    // variables already in the process win — so this is what points the
    // journeys' server at the local database rather than at production.
    command: `node --env-file=.env.test node_modules/next/dist/bin/next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
