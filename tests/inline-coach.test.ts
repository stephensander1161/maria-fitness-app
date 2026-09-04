import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * "Chat about this" happens where "this" is.
 *
 * Every ask-the-coach affordance used to be a link to the Coach tab. She lost
 * the screen she was reading, arrived at a chat with no idea what she had been
 * about to ask, and typed the name of the movement back in — so mostly she
 * didn't bother, which is the one failure this app cannot afford.
 *
 * The rule: a screen may never navigate her away to ask a question. There is
 * nowhere to navigate to any more — the coach is a bubble on every screen
 * (components/coach-bubble.tsx) and "/" only redirects to today's session.
 */

const read = (p: string) => fs.readFileSync(p, "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

suite("asking the coach never means leaving the screen", () => {
  const screens = [...walk("components"), ...walk("app")]
    .filter((f) => !f.endsWith(path.join("components", "tab-bar.tsx")));

  it("no screen links to the old Coach tab", () => {
    const offenders = screens.filter((f) => /href=(\{)?"\/"(\})?/.test(read(f)));
    expect(
      offenders,
      `these screens send her to the Coach tab instead of letting her ask here: ${offenders.join(", ")}. ` +
      "Use <AskCoach>.",
    ).toEqual([]);
  });

  it("no screen navigates to the Coach tab in code", () => {
    // Signing in and finishing onboarding land her on the home screen, which
    // redirects to today's session. That is arriving, not being sent away
    // mid-question — and so is erasing everything, which puts the profile
    // back to its first run and must not leave her on a settings page built
    // from data that no longer exists.
    const ARRIVALS = [
      "components/login-form.tsx",
      "components/signup-form.tsx",
      "components/onboarding.tsx",
      "components/erase-data.tsx",
    ];
    const offenders = screens
      .filter((f) => !ARRIVALS.includes(f))
      .filter((f) => /(push|replace)\(\s*"\/"\s*\)/.test(read(f)));
    expect(
      offenders,
      `these screens route her to the Coach tab: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the coach reaches every screen", () => {
    // This used to assert a bubble in the root layout. The bubble is gone —
    // two coach entry points on one page is one too many, and the bubble was
    // the one that knew less about the screen it floated over. The invariant
    // it existed for is unchanged and is what is checked here: from any
    // screen, asking about that screen must not mean leaving it.
    const pages = fs.readdirSync("app", { withFileTypes: true })
      // "admin" is the owner's operations console, not one of her screens: no
      // tool exposes any of it — `users` is deliberately out of the model's
      // reach — so an AskCoach there would offer help the coach cannot give.
      .filter((e) => e.isDirectory() && !["api", "admin", "login", "signup", "welcome"].includes(e.name))
      .map((e) => path.join("app", e.name, "page.tsx"))
      .filter((f) => fs.existsSync(f));

    expect(pages.length).toBeGreaterThan(4);
    const mute = pages.filter((f) => !/\bAiOpinion\b|\bAskCoach\b/.test(read(f)));
    expect(
      mute,
      `these screens have no way to reach the coach from them: ${mute.join(", ")}`,
    ).toEqual([]);
  });

  it("every surface that streams the coach goes through the shared thread", () => {
    // One implementation of "what the coach is doing right now", so a new
    // surface cannot quietly ship without tool labels or error handling.
    const offenders = walk("components")
      .filter((f) => /\bstreamCoach\s*\(/.test(read(f)));
    expect(
      offenders,
      `these components call streamCoach directly: ${offenders.join(", ")}. Use useCoachThread().`,
    ).toEqual([]);
  });
});
