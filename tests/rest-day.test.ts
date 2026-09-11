import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { dayTitle, isRestDay } from "@/lib/rest-day";

suite("a day with work on it is not a rest day", () => {
  it("lets the movements overrule the flag", () => {
    /*
      Found in Maria's real plan: Thursday flagged is_rest with six movements
      on it, and titled "Workout". planSummary renders a rest day as the single
      word "rest" and lists none of its exercises, so the coach was handed a
      week in which that day held nothing — and the state block is the thing
      the model believes completely. It told her it was a rest day while she
      was looking at the session she had built on it.
    */
    expect(isRestDay({ isRest: true, movements: 6 })).toBe(false);
    expect(isRestDay({ isRest: true, movements: 1 })).toBe(false);
  });

  it("still trusts the flag on an empty day", () => {
    // "Rest" and "Nothing planned" are different things to be told: one is a
    // day she has deliberately left clear, the other one she has not filled in.
    expect(isRestDay({ isRest: true, movements: 0 })).toBe(true);
    expect(isRestDay({ isRest: false, movements: 0 })).toBe(false);
  });

  it("never calls a day with movements a rest, however it was flagged", () => {
    expect(isRestDay({ isRest: false, movements: 3 })).toBe(false);
  });

  it("renames a session still carrying a rest title", () => {
    // A title left over from when the day was empty is worse than none.
    expect(dayTitle({ title: "Rest", isRest: true, movements: 4 })).toBe("Session");
    expect(dayTitle({ title: "Rest day", isRest: true, movements: 4 })).toBe("Session");
    // Left alone when it really is a rest day…
    expect(dayTitle({ title: "Rest", isRest: true, movements: 0 })).toBe("Rest");
    // …and when the title says something real.
    expect(dayTitle({ title: "Hips & Balance", isRest: true, movements: 6 })).toBe("Hips & Balance");
    // "Wrestling" is not "rest".
    expect(dayTitle({ title: "Wrestling", isRest: false, movements: 2 })).toBe("Wrestling");
  });
});

suite("one rule, everywhere it is asked", () => {
  const views = fs.readFileSync("lib/views.ts", "utf8");

  it("the day's own screen and the week both count the movements", () => {
    expect(views).toMatch(/restWordsFor\(day, all\.length\)/);
    expect(views).toMatch(/restWordsFor\(d, mine\.length\)/);
    expect(views).toMatch(/isRestDay\(\{ isRest: day\.isRest, movements \}\)/);
  });

  it("so the coach's week inherits it rather than deciding again", () => {
    // planSummary reads week.days[].isRest, which is now the corrected value —
    // a second copy of this judgement is how the screen and the coach came to
    // disagree about the streak once already.
    const fn = views.slice(views.indexOf("export async function planSummary"));
    expect(fn.slice(0, 1200)).toMatch(/d\.isRest/);
    expect(fn.slice(0, 1200)).not.toMatch(/d\.exercises\.length === 0/);
  });
});
