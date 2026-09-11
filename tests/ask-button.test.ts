import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const button = fs.readFileSync("components/ask-button.tsx", "utf8");
const nav = fs.readFileSync("components/side-nav.tsx", "utf8");
const greeting = fs.readFileSync("components/mobile-greeting.tsx", "utf8");

suite("the coach, from the top of any screen", () => {
  it("is on every page, in the app's own furniture", () => {
    // The sidebar on a desktop, the greeting bar on a phone — the same place
    // on both, rather than one in the chrome and one floating in the page.
    expect(nav).toMatch(/<AskButton \/>/);
    expect(greeting).toMatch(/<AskButton \/>/);
  });

  it("survives a scroll, which is the whole point", () => {
    // The companion at the bottom of the page was the only way in, so asking
    // about the thing she is looking at meant scrolling past all of it first.
    // The sidebar is full-height and does not scroll with the page.
    expect(nav).toMatch(/md:h-dvh/);
    expect(greeting).toMatch(/sticky top-0/);
  });

  it("opens the one sheet rather than drawing its own", () => {
    // One conversation, mounted once in the root layout — the chat sheet
    // draws no button of its own and never has.
    expect(button).toMatch(/new CustomEvent\("coach:open"\)/);
    expect(button).not.toMatch(/useCoachThread|streamCoach/);
  });

  it("never sits over the page it is meant to be about", () => {
    // Sticky in the content column it followed her down the page and landed
    // on the buttons at the right edge of every card.
    expect(fs.readFileSync("app/layout.tsx", "utf8")).not.toMatch(/AskButton/);
  });

  it("shows one of them at a time", () => {
    // The sidebar carries it on a desktop and the greeting bar on a phone;
    // both at once would be two buttons doing one job.
    expect(greeting).toMatch(/md:hidden/);
    expect(nav).toMatch(/hidden w-56[^"]*md:flex/);
  });

  it("clears the notch when installed to the home screen", () => {
    expect(greeting).toMatch(/env\(safe-area-inset-top/);
  });
});
