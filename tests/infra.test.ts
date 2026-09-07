import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { databaseUrlFor } from "@/lib/env";
import { PLANNER_DEADLINE_MS, plannerError } from "@/lib/agent/planner";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("which database the process talks to", () => {
  const prod = "postgresql://prod";
  const dev = "postgresql://dev-branch";

  it("the dev server prefers the development branch", () => {
    expect(databaseUrlFor({ nodeEnv: "development", url: prod, devUrl: dev })).toEqual({ url: dev, warning: null });
  });

  it("says so out loud when the dev server has to use production", () => {
    const chosen = databaseUrlFor({ nodeEnv: "development", url: prod, devUrl: undefined });
    expect(chosen.url).toBe(prod);
    expect(chosen.warning).toMatch(/production database/);
    expect(chosen.warning).toMatch(/DATABASE_URL_DEV/);
  });

  it("production never looks at the dev variable, whatever is set", () => {
    expect(databaseUrlFor({ nodeEnv: "production", url: prod, devUrl: dev })).toEqual({ url: prod, warning: null });
  });

  it("scripts mean production: they run with NODE_ENV unset", () => {
    // `npm run requests` reads the real feedback table and `npm run user`
    // grants real roles. A dev branch there would be silently doing nothing.
    expect(databaseUrlFor({ nodeEnv: undefined, url: prod, devUrl: dev })).toEqual({ url: prod, warning: null });
    expect(databaseUrlFor({ nodeEnv: "test", url: prod, devUrl: dev })).toEqual({ url: prod, warning: null });
  });
});

suite("the planner has a deadline inside the function's own", () => {
  it("is shorter than the route's wall with room for the work around it", () => {
    const vercel = JSON.parse(read("vercel.json"));
    const wall = vercel.functions["app/api/chat/route.ts"].maxDuration * 1000;
    expect(PLANNER_DEADLINE_MS).toBeLessThanOrEqual(wall - 10_000);
    expect(PLANNER_DEADLINE_MS).toBeGreaterThanOrEqual(30_000);
  });

  it("is actually passed to the call", () => {
    const src = read("lib/agent/planner.ts");
    expect(src).toMatch(/AbortSignal\.timeout\(PLANNER_DEADLINE_MS\)/);
  });

  it("turns an abort into a sentence and leaves other errors alone", () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(plannerError(timeout).message).toMatch(/took too long/);
    expect(plannerError(timeout).message).toMatch(/nothing was changed/i);
    const abort = new DOMException("aborted", "AbortError");
    expect(plannerError(abort).message).toMatch(/took too long/);
    const other = new Error("overloaded_error");
    expect(plannerError(other)).toBe(other);
    expect(plannerError("string").message).toBe("string");
  });
});
