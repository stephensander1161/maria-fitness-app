import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
const src = fs.readFileSync("components/onboarding.tsx", "utf8");
import { defaultThemeFor, isThemeId, DEFAULT_THEME } from "@/lib/theme";

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

suite("a new account's first look — 2026-09-18", () => {
  // "I don't like the default colour, and it should be different for each
  // gender." Set at onboarding from the answer, through set_theme, so it is
  // as changeable as any other theme; Midnight stays the fallback for a row
  // with nothing in the column.
  it("is a real theme for every answer, and not the old orange for any of them", () => {
    for (const sex of ["female", "male", "other", null] as const) {
      const id = defaultThemeFor(sex);
      expect(isThemeId(id), String(sex)).toBe(true);
      expect(id, String(sex)).not.toBe(DEFAULT_THEME);
    }
    expect(defaultThemeFor("female")).not.toBe(defaultThemeFor("male"));
  });

  it("is set by the onboard route through the tool", () => {
    const route = fs.readFileSync("app/api/onboard/route.ts", "utf8");
    expect(route).toMatch(/runTool\("set_theme", \{ theme: defaultThemeFor\(input\.sex\) \}, ctx\)/);
  });
});
