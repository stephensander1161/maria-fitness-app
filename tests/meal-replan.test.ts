import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const planner = fs.readFileSync("lib/agent/planner.ts", "utf8");
const tool = fs.readFileSync("lib/tools/nutrition.ts", "utf8");
const sheet = fs.readFileSync("components/meal-plan-setup.tsx", "utf8");

suite("re-planning one day", () => {
  it("asks the planner for that day, not the week", () => {
    // Asking for seven days to keep one of them is six days of work and six
    // days of churn in meals she was happy with.
    const fn = planner.slice(planner.indexOf("export async function planMeals"));
    expect(fn.slice(0, 2600)).toMatch(/emit no meals for any other day/);
    expect(fn.slice(0, 2600)).toMatch(/only === null\s*\n\s*\? `all seven days/);
  });

  it("drops anything outside the scope rather than trusting it", () => {
    // A planner that answers with Wednesday as well would otherwise quietly
    // replace a day she did not ask about.
    const fn = planner.slice(planner.indexOf("export async function planMeals"));
    expect(fn.slice(0, 3000)).toMatch(/result\.meals\.filter\(\(m\) => only\.includes\(m\.dayOfWeek\)\)/);
  });

  it("checks the target only on the days it wrote", () => {
    const fn = planner.slice(planner.indexOf("export async function planMeals"));
    expect(fn.slice(0, 3200)).toMatch(/if \(only !== null && !only\.includes\(dow\)\) return null/);
  });

  it("deletes only those days' meals", () => {
    // The rest of the week keeps its meals and the recipes already written
    // against them — a recipe costs a model call, and wiping one to re-plan a
    // different day spends money for nothing.
    expect(tool).toMatch(/inArray\(meals\.dayOfWeek, only\)/);
  });

  it("does not let one day rewrite the week's write-up", () => {
    // That paragraph is about the week; a rationale for Thursday standing in
    // for it would describe a plan she is not looking at.
    expect(tool).toMatch(/const rationale = only === null \? drafted\.rationale : undefined/);
    expect(tool).toMatch(/\.\.\.\(rationale === undefined \? \{\} : \{ rationale \}\)/);
  });
});

suite("the questionnaire it kicks off", () => {
  it("asks the food questions, not the training ones", () => {
    // run_plan_setup rebuilds her *training* week as its first act, which is a
    // surprising thing to happen to somebody who asked for different dinners.
    expect(sheet).not.toMatch(/run_plan_setup/);
    expect(sheet).toMatch(/action\("update_profile"/);
    expect(sheet).toMatch(/action\("create_meal_plan"/);
  });

  it("keeps her answers even when the planner fails", () => {
    // She should not have to type them twice.
    const build = sheet.slice(sheet.indexOf("async function build()"));
    expect(build.indexOf("update_profile")).toBeLessThan(build.indexOf("create_meal_plan"));
  });

  it("offers a day or the week, and sends days only for a day", () => {
    expect(sheet).toMatch(/options=\{\["The whole week", "One day"\]\}/);
    expect(sheet).toMatch(/scope === "day" \? \{ days: \[day\] \} : \{\}/);
  });

  it("refuses rather than inventing targets it does not have", () => {
    expect(sheet).toMatch(/Set your calorie and protein targets first/);
  });
});
