import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { COACH_NAME_MAX, coachNameOf, DEFAULT_COACH_NAME, possessive } from "@/lib/coach-name";
const read = (p: string) => fs.readFileSync(p, "utf8");

suite("what she calls her coach — 2026-09-18", () => {
  // "Add an option on startup to name our coach and the ability in Settings
  // to rename; default will be Coach."
  it("is Coach unless she says otherwise, and never blank, long or unprintable", () => {
    expect(coachNameOf(null)).toBe(DEFAULT_COACH_NAME);
    expect(coachNameOf("   ")).toBe(DEFAULT_COACH_NAME);
    expect(coachNameOf("  Bertha  ")).toBe("Bertha");
    expect(coachNameOf("Big\u0000 Dave\u001b[2K")).toBe("Big Dave");
    expect(coachNameOf("x".repeat(80))).toHaveLength(COACH_NAME_MAX);
    expect(possessive("Coach")).toBe("Coach's");
    expect(possessive("James")).toBe("James'");
  });

  it("is asked once at onboarding, optional, and stored through update_profile", () => {
    const onboarding = read("components/onboarding.tsx");
    expect(onboarding).toMatch(/And your coach\? \(optional\)/);
    expect(onboarding).toMatch(/placeholder="Coach"/);
    expect(onboarding).toMatch(/coachName: coachName\.trim\(\)/);
    const route = read("app/api/onboard/route.ts");
    expect(route).toMatch(/coachName: z\.string\(\)\.max\(40\)\.optional\(\)/);
    expect(route).toMatch(/coachName: input\.coachName,/);
    expect(read("lib/tools/profile.ts")).toMatch(/patch\.coachName = coachNameOf\(input\.coachName\)/);
  });

  it("can be renamed in Settings", () => {
    expect(read("app/settings/page.tsx")).toMatch(/<CoachName name=\{coachNameOf\(profile\.coachName\)\} \/>/);
    expect(read("components/coach-name.tsx")).toMatch(/action\("update_profile", \{ coachName: value \}\)/);
  });

  it("is the coach's name in the prompt, and only when it is not the default", () => {
    const sys = read("lib/agent/system.ts");
    expect(sys).toMatch(/She calls you \$\{coachNameOf\(profile\.coachName\)\}/);
    expect(sys).toMatch(/=== DEFAULT_COACH_NAME\s*\?\s*""/);
  });

  it("is what every button that names the coach says", () => {
    for (const f of ["companion", "ai-opinion", "ask-button", "coach-bubble", "coach-thread", "today-food", "train-client"]) {
      const src = read(`components/${f}.tsx`);
      expect(src, f).toMatch(/useCoachName\(\)/);
      expect(src, f).not.toMatch(/"Ask your coach"|"Your coach"|Coach&apos;s read|"Message your coach"|"Tell your coach what you ate"/);
    }
    expect(read("app/layout.tsx")).toMatch(/<CoachNameProvider value=\{coachName\}>/);
  });
});
