import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { budgetFor, dollars } from "@/lib/budget";

const CEILING = 2_000_000; // $2/day

suite("a per-person daily budget", () => {
  it("reads a sum of money the way it is typed", () => {
    expect(budgetFor("2", CEILING)).toEqual({ ok: true, micros: 2_000_000, note: "$2.00/day" });
    expect(budgetFor("0.50", CEILING)).toMatchObject({ ok: true, micros: 500_000 });
    expect(budgetFor("$1.25", CEILING)).toMatchObject({ ok: true, micros: 1_250_000 });
    expect(budgetFor(" 2 ", CEILING)).toMatchObject({ ok: true, micros: 2_000_000 });
  });

  it("clears the budget back to the ceiling", () => {
    for (const word of ["none", "None", "full", "default"]) {
      expect(budgetFor(word, CEILING), word).toMatchObject({ ok: true, micros: null });
    }
  });

  it("refuses to lift the ceiling, and says what to do instead", () => {
    // The invariant behind set_coach_budget: a per-person budget may only
    // tighten. Silently clamping would show the number back and cap her at
    // the old one, which is the failure this refusal exists to prevent.
    const out = budgetFor("5", CEILING);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.error).toContain("$5.00/day is above");
    expect(out.error).toContain("DAILY_COST_LIMIT_MICROS");
    expect(out.error).toContain("5000000");
    // …including the part people get wrong: raising it raises it for everyone.
    expect(out.error).toMatch(/everyone else/);
    // The ceiling itself is allowed, to the micro.
    expect(budgetFor("2", CEILING)).toMatchObject({ ok: true });
  });

  it("refuses anything that is not an amount", () => {
    for (const bad of ["", "lots", "-1", "2 dollars", "NaN", "1e999"]) {
      expect(budgetFor(bad, CEILING).ok, bad).toBe(false);
    }
    // Zero is a real answer: no coach at all today.
    expect(budgetFor("0", CEILING)).toMatchObject({ ok: true, micros: 0 });
  });

  it("renders money the way the console does", () => {
    expect(dollars(500_000)).toBe("$0.50");
    expect(dollars(2_000_000)).toBe("$2.00");
    expect(dollars(0)).toBe("$0.00");
  });

  it("is the owner's command line, never a tool", () => {
    // Same rule as `role`: it reaches another person's account, and a prompt
    // that could set a budget is a prompt that could raise its own.
    for (const file of fs.readdirSync("lib/tools")) {
      expect(fs.readFileSync(`lib/tools/${file}`, "utf8"), file).not.toMatch(/@\/lib\/budget/);
    }
    expect(fs.readFileSync("scripts/users.ts", "utf8")).toMatch(/case "budget"/);
  });
});
