import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { registry } from "@/lib/tools";

const src = fs.readFileSync("lib/tools/nutrition.ts", "utf8");
const handler = src.slice(src.indexOf('name: "log_planned_day"'), src.indexOf("export const removeMealLog"));

suite("logging the day she ate the plan", () => {
  it("is a registered tool, so the coach can do it by voice too", () => {
    const tool = registry.get("log_planned_day");
    expect(tool).toBeDefined();
    // The description leads with what it does. One that opens with a
    // constraint reads as a refusal — that is how set_coach_budget came to
    // answer "I don't have control over that" while holding the tool.
    expect(tool!.description.startsWith("Logs")).toBe(true);
  });

  it("skips a slot that already has something in it, not a matching id", () => {
    /*
      The bug this exists for, caught on a live probe: she typed her own
      breakfast in, which carries no planned-meal id, so an id match found
      nothing and the button logged a second breakfast on top — 2150 kcal for
      a 1730 kcal day, under copy promising it would leave her entries alone.
    */
    expect(handler).toMatch(/select\(\{ slot: mealLogs\.slot \}\)/);
    expect(handler).toMatch(/const taken = new Set\(already\.map\(\(r\) => r\.slot\)\)/);
    expect(handler).toMatch(/rows\.filter\(\(m\) => !taken\.has\(m\.slot\)/);
    // And the same rule in the browser, or the button offers to log a meal
    // the tool is about to refuse.
    expect(fs.readFileSync("components/eat-client.tsx", "utf8"))
      .toMatch(/takenSlots\.has\(m\.slot\)/);
  });

  it("cannot log the same planned meal twice even on a retry", () => {
    // One key per planned meal per day, on the unique column — a double tap
    // on a slow connection is the normal shape of this.
    expect(handler).toMatch(/clientKey: `planned:\$\{ctx\.profileId\}:\$\{date\}:\$\{m\.id\}`/);
    expect(handler).toMatch(/onConflictDoNothing\(\{ target: mealLogs\.clientKey \}\)/);
  });

  it("takes the ingredients out of the kitchen, as logging one at a time does", () => {
    expect(handler).toMatch(/consumeForMeal\(ctx\.profileId, m\.ingredients\)/);
  });

  it("finds the meals through her own plan, never by id alone", () => {
    // Same rule as herMeal: a meal is hers because the plan it belongs to is.
    expect(handler).toMatch(/eq\(mealPlans\.profileId, ctx\.profileId\)/);
  });

  it("logs no fibre figure rather than a zero", () => {
    // The planner writes calories and macros and has never written fibre.
    // Zero would make the day's fibre look complete and short.
    expect(handler).toMatch(/fibreG: null/);
  });

  it("refuses a day she has not reached yet", () => {
    expect(handler).toMatch(/isFuture\(date, her\)/);
  });
});
