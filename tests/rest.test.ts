import { describe as suite, expect, it } from "vitest";
import { MAX_REST_SECONDS, MIN_REST_SECONDS, restSecondsFor } from "@/lib/rest";

/**
 * Rest has three sources and they have to stay in this order: the group she
 * set, the default she set, the number the plan wrote. Getting the precedence
 * subtly wrong is silent — the timer runs, just for the wrong length.
 */
suite("how long she rests", () => {
  const none = { defaultRestSeconds: null, restByGroup: null };

  it("falls back to the plan when she has set nothing", () => {
    expect(restSecondsFor(none, "Legs", 90)).toBe(90);
  });

  it("her default beats the plan", () => {
    expect(restSecondsFor({ defaultRestSeconds: 60, restByGroup: null }, "Legs", 90)).toBe(60);
  });

  it("the group beats her default", () => {
    const prefs = { defaultRestSeconds: 60, restByGroup: { Legs: 180 } };
    expect(restSecondsFor(prefs, "Legs", 90)).toBe(180);
    // And a group she has not set still gets the default, not the plan.
    expect(restSecondsFor(prefs, "Arms", 90)).toBe(60);
  });

  it("a movement with no group still gets her default", () => {
    expect(restSecondsFor({ defaultRestSeconds: 45, restByGroup: { Legs: 180 } }, null, 90)).toBe(45);
  });

  it("refuses a stored zero rather than disabling the timer", () => {
    // No interface here can set zero, but a bad write or a hand-edited row
    // would otherwise turn the rest timer off without saying so.
    expect(restSecondsFor({ defaultRestSeconds: 0, restByGroup: null }, "Legs", 90)).toBe(90);
    expect(restSecondsFor({ defaultRestSeconds: null, restByGroup: { Legs: 0 } }, "Legs", 90)).toBe(90);
  });

  it("clamps to something a person would actually rest for", () => {
    expect(restSecondsFor({ defaultRestSeconds: 2, restByGroup: null }, null, 90)).toBe(MIN_REST_SECONDS);
    expect(restSecondsFor({ defaultRestSeconds: 99_999, restByGroup: null }, null, 90)).toBe(MAX_REST_SECONDS);
  });
});
