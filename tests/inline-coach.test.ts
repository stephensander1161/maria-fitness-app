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
    // mid-question.
    const ARRIVALS = ["components/login-form.tsx", "components/onboarding.tsx"];
    const offenders = screens
      .filter((f) => !ARRIVALS.includes(f))
      .filter((f) => /(push|replace)\(\s*"\/"\s*\)/.test(read(f)));
    expect(
      offenders,
      `these screens route her to the Coach tab: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the coach reaches every screen", () => {
    // A bubble in the root layout, not a destination. If this ever stops being
    // rendered globally, asking about the screen she is on means leaving it.
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/CoachBubbleGate/);
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
