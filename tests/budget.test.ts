import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { budgetFor, dollars, topUpFor, MAX_TOP_UP_MICROS } from "@/lib/budget";
import { registry } from "@/lib/tools";

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

suite("a day's top-up", () => {
  it("reads an amount to add for today", () => {
    expect(topUpFor("1")).toEqual({ ok: true, micros: 1_000_000, note: "$1.00 extra today" });
    expect(topUpFor("$2.50")).toMatchObject({ ok: true, micros: 2_500_000 });
  });

  it("takes a grant back", () => {
    for (const word of ["none", "clear", "0"]) {
      expect(topUpFor(word), word).toMatchObject({ ok: true, micros: 0 });
    }
  });

  it("has a ceiling of its own, because it is the one thing that lifts the cap", () => {
    // A mistyped "20" for "2.0" should cost a couple of dollars, not twenty.
    expect(topUpFor("20").ok).toBe(false);
    expect(topUpFor(String(MAX_TOP_UP_MICROS / 1_000_000))).toMatchObject({ ok: true });
    const over = topUpFor("6");
    if (over.ok) throw new Error("unreachable");
    expect(over.error).toContain("$5.00");
  });

  it("refuses anything that is not an amount, empty included", () => {
    for (const bad of ["", "  ", "lots", "-1", "1e999"]) {
      expect(topUpFor(bad).ok, bad).toBe(false);
    }
  });

  it("is granted from the command line and can only be asked for from the app", () => {
    // The invariant: a prompt that could grant is a prompt that could buy
    // itself an unlimited day. Asking is a tool; granting is not.
    const tool = registry.get("request_top_up")!;
    expect(tool).toBeDefined();
    expect(tool.uiOnly).toBeUndefined(); // she may ask the coach for it too
    const src = fs.readFileSync("lib/tools/top-up.ts", "utf8");
    expect(src).not.toMatch(/topUpMicros|topUpOn:/);   // it may set the ask, never the grant
    expect(src).toMatch(/topUpRequestedOn: day/);
    for (const file of fs.readdirSync("lib/tools")) {
      expect(fs.readFileSync(`lib/tools/${file}`, "utf8"), file).not.toMatch(/topUpFor|MAX_TOP_UP_MICROS/);
    }
    expect(fs.readFileSync("scripts/users.ts", "utf8")).toMatch(/case "topup"/);
  });

  it("only counts on the ledger day it was granted for", () => {
    // Yesterday's grant must not quietly extend into today, or one top-up is
    // a permanent raise nobody remembers giving.
    const limits = fs.readFileSync("lib/limits.ts", "utf8");
    expect(limits).toMatch(/row\.topUpOn === today\(\) \? row\.topUpMicros : 0/);
    expect(limits).toMatch(/return chosen \+ granted/);
  });

  it("the refusal she sees says whether there is anything to be done", () => {
    const limits = fs.readFileSync("lib/limits.ts", "utf8");
    // "spent" is the one denial with a way out; the rate limits are just waits.
    expect(limits).toMatch(/code: "spent"/);
    expect(limits).toMatch(/code: "rate"/);
    expect(fs.readFileSync("components/coach-thread.tsx", "utf8")).toMatch(/errorCode === "spent" && <AskForMore \/>/);
    expect(fs.readFileSync("lib/client.ts", "utf8")).toMatch(/new CoachError\(/);
  });
});
