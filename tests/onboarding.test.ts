import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
const src = fs.readFileSync("components/onboarding.tsx", "utf8");

suite("onboarding", () => {
  it("does not ask the birth question of anyone who said male — 2026-09-18", () => {
    // The step's own comment promised this from the start ("offered to
    // everyone who has not said male") and the code walked everyone through
    // it. "Don't ask the birth question if I choose male."
    expect(src).toMatch(/const skipRecovery = sex === "male";/);
    expect(src).toMatch(/skipRecovery \? \[0, 1, 2, 4\] : \[0, 1, 2, 3, 4\]/);
    // Next, Back and the bar all read the same list — no hard-coded ±1.
    expect(src).toMatch(/onClick=\{\(\) => move\(-1\)\}/);
    expect(src).toMatch(/step === 4 \? finish\(\) : move\(1\)/);
    expect(src).not.toMatch(/\(s \+ 1\) as Step|\(s - 1\) as Step/);
    expect(src).toMatch(/<Progress step=\{step\} steps=\{steps\} \/>/);
    expect(src).toMatch(/steps\.map\(\(i\) =>/);
    // A birth answer given before switching to male does not travel.
    expect(src).toMatch(/if \(v === "male"\) setGaveBirth\(false\);/);
  });

  it("is a centred card on a desktop, with the buttons under the questions", () => {
    // "Pretty hideous on desktop layout-wise": a phone column floating in an
    // empty viewport, Next pinned a screen's height below the last question.
    expect(src).toMatch(/md:flex md:min-h-dvh md:items-center md:justify-center/);
    expect(src).toMatch(/max-w-sm flex-col px-6 py-10 md:card md:min-h-0 md:max-w-md/);
    // The phone keeps its full-height column and thumb-reach buttons.
    expect(src).toMatch(/className="mt-auto flex gap-3 pt-8"/);
  });
});
