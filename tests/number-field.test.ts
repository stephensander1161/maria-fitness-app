import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const src = fs.readFileSync("components/number-field.tsx", "utf8");

suite("a number you can tap or type", () => {
  it("keeps the steppers out of the tab order", () => {
    // Tabbing from a weight to the reps beside it went weight → minus → plus
    // → reps: four presses to cross two fields, and the two in the middle
    // change the number she has just typed if she hits space by reflex.
    const minus = src.slice(src.indexOf("onClick={() => nudge(-step)}"));
    expect(minus.slice(0, 200)).toMatch(/tabIndex=\{-1\}/);
    const plus = src.slice(src.indexOf("onClick={() => nudge(step)}"));
    expect(plus.slice(0, 200)).toMatch(/tabIndex=\{-1\}/);
  });

  it("so the field itself does what they do", () => {
    // Skipping them from the keyboard is only fair if the nudge is still
    // reachable from the keyboard.
    expect(src).toMatch(/if \(e\.key === "ArrowUp"\) \{ e\.preventDefault\(\); nudge\(step\); \}/);
    expect(src).toMatch(/if \(e\.key === "ArrowDown"\) \{ e\.preventDefault\(\); nudge\(-step\); \}/);
    // They are still real buttons with real labels for a pointer and for a
    // screen reader that walks the page rather than tabbing it.
    expect(src).toMatch(/aria-label=\{`Decrease\$\{label \? ` \$\{label\}` : ""\}`\}/);
    expect(src).toMatch(/aria-label=\{`Increase\$\{label \? ` \$\{label\}` : ""\}`\}/);
  });
});
