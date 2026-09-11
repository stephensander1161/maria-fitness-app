import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const button = fs.readFileSync("components/ask-button.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const greeting = fs.readFileSync("components/mobile-greeting.tsx", "utf8");

suite("the coach, from the top of any screen", () => {
  it("is on every page, without ten pages knowing about it", () => {
    // Every page writes its own heading, so the control lives in the chrome
    // and the heading floats up beside it.
    expect(layout).toMatch(/<AskButton className="pointer-events-auto" \/>/);
    expect(greeting).toMatch(/<AskButton \/>/);
  });

  it("survives a scroll, which is the whole point", () => {
    // The companion at the bottom of the page was the only way in, so asking
    // about the thing she is looking at meant scrolling past all of it first.
    expect(layout).toMatch(/sticky top-4/);
    expect(greeting).toMatch(/sticky top-0/);
  });

  it("opens the one sheet rather than drawing its own", () => {
    // One conversation, mounted once in the root layout — the chat sheet
    // draws no button of its own and never has.
    expect(button).toMatch(/new CustomEvent\("coach:open"\)/);
    expect(button).not.toMatch(/useCoachThread|streamCoach/);
  });

  it("takes no clicks away from the page it sits over", () => {
    // A full-width sticky strip across the top of every screen would swallow
    // taps on whatever is under it; only the button itself is live.
    expect(layout).toMatch(/pointer-events-none sticky top-4/);
    expect(layout).toMatch(/pointer-events-auto/);
  });

  it("shows one of them at a time", () => {
    // The greeting bar carries it on a phone and the page's own top row on a
    // desktop; both at once would be two buttons doing one job.
    expect(greeting).toMatch(/md:hidden/);
    expect(layout).toMatch(/hidden justify-end md:flex/);
  });

  it("clears the notch when installed to the home screen", () => {
    expect(greeting).toMatch(/env\(safe-area-inset-top/);
  });
});
