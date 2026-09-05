import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { burnForSession, burnForSet, metFor, weeklyBurn, BURN_CAVEAT } from "@/lib/burn";

const read = (p: string) => fs.readFileSync(p, "utf8");
const set = (over: Partial<Parameters<typeof burnForSet>[0]> = {}) => ({
  met: null, category: "compound", reps: 10, holdSeconds: null, ...over,
});

/**
 * An estimate that people act on. The arithmetic matters less than the two
 * things around it: that it scales with the person and the work, and that it
 * never becomes food she is allowed to eat.
 */
suite("what a set costs", () => {
  it("scales with body weight", () => {
    expect(burnForSet(set(), 90)).toBeGreaterThan(burnForSet(set(), 60));
  });

  it("scales with how hard the movement is", () => {
    const compound = burnForSet(set({ category: "compound" }), 70);
    const mobility = burnForSet(set({ category: "mobility" }), 70);
    expect(compound).toBeGreaterThan(mobility);
  });

  it("prefers a movement's own measured cost to its category average", () => {
    expect(metFor({ met: 9, category: "mobility" })).toBe(9);
    expect(metFor({ met: null, category: "mobility" })).toBeLessThan(4);
  });

  it("uses the seconds held rather than a rep count that means nothing", () => {
    const long = burnForSet(set({ reps: 1, holdSeconds: 120 }), 70);
    const short = burnForSet(set({ reps: 1, holdSeconds: 20 }), 70);
    expect(long).toBeGreaterThan(short);
  });

  it("stays in a believable range for one working set", () => {
    // A set of ten squats is single-digit-to-low-teens calories, not fifty.
    // This is the guard against an order-of-magnitude slip nobody eyeballs.
    const kcal = burnForSet(set(), 70);
    expect(kcal).toBeGreaterThan(2);
    expect(kcal).toBeLessThan(25);
  });
});

suite("what a session costs", () => {
  it("adds its sets up and reports how long it took", () => {
    const s = burnForSession(Array.from({ length: 15 }, () => set()), 70);
    expect(s.sets).toBe(15);
    expect(s.minutes).toBeGreaterThan(20);
    // A 45-minute lifting session is a couple of hundred calories, not a
    // thousand — an inflated figure here is what makes trackers useless.
    expect(s.kcal).toBeGreaterThan(80);
    expect(s.kcal).toBeLessThan(500);
  });

  it("says when it fell back to category averages", () => {
    expect(burnForSession([set()], 70).estimatedFrom).toBe("category-average");
    expect(burnForSession([set({ met: 6 })], 70).estimatedFrom).toBe("measured");
    expect(burnForSession([set(), set({ met: 6 })], 70).estimatedFrom).toBe("mixed");
  });

  it("is zero for a session with nothing in it, and says nothing more", () => {
    expect(burnForSession([], 70).kcal).toBe(0);
  });
});

suite("a week", () => {
  it("averages only the days she actually trained", () => {
    const w = weeklyBurn([
      { date: "2026-09-01", kcal: 300, sets: 12 },
      { date: "2026-09-03", kcal: 200, sets: 8 },
    ]);
    expect(w.total).toBe(500);
    expect(w.sessions).toBe(2);
    expect(w.perSession).toBe(250);
  });

  it("returns null rather than zero when she has not trained", () => {
    // An average over no sessions is not zero calories. Zero next to a number
    // reads as a bad week, which is the one thing this app does not do.
    expect(weeklyBurn([]).perSession).toBeNull();
    expect(weeklyBurn([{ date: "2026-09-01", kcal: 0, sets: 0 }]).perSession).toBeNull();
  });
});

suite("it never becomes food", () => {
  it("says so wherever the number is shown", () => {
    expect(BURN_CAVEAT).toMatch(/not added to what you can eat/i);
    expect(read("components/burn-card.tsx")).toMatch(/BURN_CAVEAT/);
  });

  it("is not wired into any target", () => {
    // The app's expenditure figure is measured from intake against her weight
    // trend, and that already contains her training. Adding an estimate on top
    // would count the same session twice.
    for (const file of ["lib/nutrition.ts", "lib/expenditure.ts", "lib/tools/check-in.ts"]) {
      expect(read(file), `${file} must not import the burn estimate`)
        .not.toMatch(/from "@\/lib\/burn"/);
    }
  });
});
