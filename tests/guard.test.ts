import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  MAX_CALLS_PER_ITERATION, MAX_CALLS_PER_TURN, PLANNER_START_CUTOFF_MS, TOOL_START_CUTOFF_MS, TurnGuard,
} from "@/lib/agent/guard";
import { registry } from "@/lib/tools";

const slow = (name: string) => name === "create_meal_plan" || name === "create_weekly_plan";
const call = (name: string, input: unknown = {}, id = `${name}-${Math.random()}`) => ({ id, name, input });
const refusals = (out: { refusal: string | null }[]) => out.map((a) => a.refusal);

suite("what one turn may do", () => {
  it("admits ordinary calls made early", () => {
    const g = new TurnGuard(0, slow);
    expect(refusals(g.admit([call("log_meal", { description: "eggs" }), call("lookup_food", { query: "toast" })], 2_000)))
      .toEqual([null, null]);
  });

  it("refuses an exact repeat of a call already made this turn, whatever the key order", () => {
    const g = new TurnGuard(0, slow);
    g.admit([call("lookup_food", { query: "oats", allowEstimate: true })], 1_000);
    const [again, different] = refusals(g.admit([
      call("lookup_food", { allowEstimate: true, query: "oats" }),
      call("lookup_food", { query: "oats" }),
    ], 2_000));
    expect(again).toMatch(/already called with exactly this input/);
    expect(different).toBeNull();
  });

  it("admits one planner per turn and answers the second with what to say", () => {
    const g = new TurnGuard(0, slow);
    const [first, second] = refusals(g.admit([call("create_weekly_plan"), call("create_meal_plan")], 1_000));
    expect(first).toBeNull();
    expect(second).toMatch(/one plan per message/);
    expect(second).toMatch(/ask for this one as its own message/);
  });

  it("does not start a planner late in the turn, and says so rather than dying at the wall", () => {
    // The transcript this comes from: a meal plan fired forty seconds in.
    const g = new TurnGuard(0, slow);
    expect(refusals(g.admit([call("create_meal_plan")], PLANNER_START_CUTOFF_MS + 1))[0]).toMatch(/no longer has that long/);
    expect(refusals(new TurnGuard(0, slow).admit([call("create_meal_plan")], PLANNER_START_CUTOFF_MS))[0]).toBeNull();
    // An ordinary call at the same moment is fine.
    expect(refusals(g.admit([call("lookup_food", { query: "x" })], PLANNER_START_CUTOFF_MS + 1))[0]).toBeNull();
  });

  it("starts nothing at all once the turn is out of time", () => {
    const g = new TurnGuard(0, slow);
    expect(refusals(g.admit([call("log_set", { reps: 8 })], TOOL_START_CUTOFF_MS + 1))[0]).toMatch(/out of time/);
    expect(refusals(g.admit([call("log_set", { reps: 8 })], TOOL_START_CUTOFF_MS))[0]).toBeNull();
  });

  it("caps the fan-out of one step and the total for the turn", () => {
    const g = new TurnGuard(0, slow);
    const burst = Array.from({ length: MAX_CALLS_PER_ITERATION + 2 }, (_, i) => call("lookup_food", { query: `food ${i}` }));
    const out = refusals(g.admit(burst, 1_000));
    expect(out.filter((r) => r === null)).toHaveLength(MAX_CALLS_PER_ITERATION);
    expect(out.at(-1)).toMatch(/Too many tool calls at once/);

    const g2 = new TurnGuard(0, slow);
    let admitted = 0;
    for (let step = 0; step < 10; step++) {
      const batch = Array.from({ length: 5 }, (_, i) => call("lookup_food", { query: `s${step}-${i}` }));
      admitted += refusals(g2.admit(batch, 1_000)).filter((r) => r === null).length;
    }
    expect(admitted).toBe(MAX_CALLS_PER_TURN);
  });

  it("only refuses; it never runs anything — a refusal carries the reason back to the model", () => {
    const g = new TurnGuard(0, slow);
    g.admit([call("log_meal", { description: "x" })], 100);
    const [a] = g.admit([call("log_meal", { description: "x" })], 200);
    expect(a.refusal).toBeTruthy();
    expect(a.call.name).toBe("log_meal");
  });
});

suite("the loop and the registry agree with the guard", () => {
  const code = (p: string) => fs.readFileSync(p, "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

  it("every tool that calls the planner is marked slow, and nothing else is", () => {
    const marked = [...registry.values()].filter((t) => t.slow === "planner").map((t) => t.name).sort();
    expect(marked).toEqual(["create_meal_plan", "create_weekly_plan", "estimate_recipe_from_photo", "get_meal_recipe"]);
    // Checked against the source: a new planner-calling tool without the
    // mark would run past the guard.
    for (const file of fs.readdirSync("lib/tools")) {
      const src = fs.readFileSync(`lib/tools/${file}`, "utf8");
      const callers = (src.match(/\b(planWeek|planMeals|writeRecipe|readRecipePhoto)\(/g) ?? []).length;
      const marks = (src.match(/slow: "planner"/g) ?? []).length;
      expect(marks, `lib/tools/${file}: ${callers} planner call(s), ${marks} slow mark(s)`).toBe(callers);
    }
  });

  it("the loop admits through the guard before anything runs, and runs only what was admitted", () => {
    const loop = code("lib/agent/loop.ts");
    expect(loop).toMatch(/new TurnGuard\(\s*Date\.now\(\)/);
    expect(loop.indexOf("guard.admit(calls")).toBeLessThan(loop.indexOf("runTool(call.name"));
    expect(loop).toMatch(/if \(refusal !== null\)/);
    expect(loop).toMatch(/for \(const call of admitted\) yield \{ type: "tool", name: call\.name, status: "running" \}/);
  });

  it("the persona says adding is one step and a refusal is not to be retried", () => {
    const persona = fs.readFileSync("lib/agent/system.ts", "utf8");
    expect(persona).toMatch(/## Adding things is one step/);
    expect(persona).toMatch(/add_exercise_to_day once per day she means/);
    expect(persona).toMatch(/Never retry a refused call/);
  });
});

suite("a repeat she meant is not a loop", () => {
  it("lets an expected repeat through, and still refuses one that is not", () => {
    // Four sets of twelve at bodyweight are four identical log_set calls.
    // The dedupe refused three of them and the coach told her to go and tap
    // the rest in herself.
    const g = new TurnGuard(0, slow, (name) => name === "log_set");
    const four = Array.from({ length: 4 }, () => call("log_set", { exerciseSlug: "bicep-curl", reps: 12 }));
    expect(refusals(g.admit(four, 1_000))).toEqual([null, null, null, null]);
    // A read repeating itself is still a loop.
    const g2 = new TurnGuard(0, slow, (name) => name === "log_set");
    g2.admit([call("get_plan", {})], 100);
    expect(refusals(g2.admit([call("get_plan", {})], 200))[0]).toMatch(/already called/);
  });

  it("marks the tools whose repeats are her intent, with the reason", () => {
    const repeatable = [...registry.values()].filter((t) => t.repeatable).map((t) => t.name).sort();
    expect(repeatable).toEqual(["log_meal", "log_set"]);
    for (const name of repeatable) {
      // The reason, not a boolean — the same rule as uiOnly.
      expect(registry.get(name)!.repeatable!.length, name).toBeGreaterThan(20);
    }
    // Still bounded: a runaway cannot become unlimited just because it repeats.
    const g = new TurnGuard(0, slow, () => true);
    let admitted = 0;
    for (let step = 0; step < 10; step++) {
      admitted += refusals(g.admit(Array.from({ length: 5 }, () => call("log_set", { reps: 8 })), 1_000))
        .filter((r) => r === null).length;
    }
    expect(admitted).toBe(MAX_CALLS_PER_TURN);
  });

  it("the loop tells the guard which tools those are", () => {
    expect(fs.readFileSync("lib/agent/loop.ts", "utf8"))
      .toMatch(/registry\.get\(name\)\?\.repeatable !== undefined/);
  });
});
