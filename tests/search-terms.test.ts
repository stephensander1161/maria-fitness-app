import { describe as suite, expect, it } from "vitest";
import { matchesQuery, normalise, queryVariants } from "@/lib/search-terms";

const pullUp = { name: "Pull-Up", muscles: ["lats", "biceps"], tags: ["back"] };
const pushUp = { name: "Push-Up", muscles: ["chest"], tags: [] };
const squat = { name: "Goblet Squat", muscles: ["quads", "glutes"], tags: [] };

suite("search matches how people say it", () => {
  it("treats hyphen, space and no separator as one spelling", () => {
    for (const q of ["pull up", "pull-up", "pullup", "Pull Up", "pull  up"]) {
      expect(matchesQuery(q, pullUp), q).toBe(true);
    }
  });

  it("drops a plural", () => {
    expect(matchesQuery("pull ups", pullUp)).toBe(true);
    expect(matchesQuery("squats", squat)).toBe(true);
    expect(normalise("Goblet Squats")).toBe("goblet squat");
    // ...without mangling a word that ends in a double s.
    expect(normalise("press")).toBe("press");
  });

  it("knows the dialect names", () => {
    expect(matchesQuery("press ups", pushUp)).toBe(true);
    expect(matchesQuery("pressup", pushUp)).toBe(true);
  });

  it("still finds by muscle and by tag", () => {
    expect(matchesQuery("lats", pullUp)).toBe(true);
    expect(matchesQuery("back", pullUp)).toBe(true);
  });

  it("does not match everything", () => {
    expect(matchesQuery("pull up", squat)).toBe(false);
    expect(matchesQuery("", squat)).toBe(false);
    expect(matchesQuery("   ", squat)).toBe(false);
  });

  it("gives the SQL side the same spellings", () => {
    const v = queryVariants("Pull Ups");
    expect(v).toContain("pull up");
    expect(v).toContain("pull-up");
    expect(v).toContain("pullup");
    expect(queryVariants("")).toEqual([]);
  });
});
