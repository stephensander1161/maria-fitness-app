import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  LADDER_STEP, MAX_RUNGS, nextRung, rungProgress, rungReached, rungTitle, weightLadder,
} from "@/lib/milestones";

const read = (p: string) => fs.readFileSync(p, "utf8");
const targets = (rs: { target: number }[]) => rs.map((r) => r.target);

suite("the ladder points the way she is going", () => {
  it("counts down for weight loss", () => {
    const l = weightLadder({ startWeight: 180, goalWeight: 160, direction: "lose", units: "imperial" });
    expect(targets(l)).toEqual([175, 170, 165, 160]);
    expect(l.map((r) => r.moved)).toEqual([5, 10, 15, 20]);
    expect(l.at(-1)!.isGoal).toBe(true);
    expect(l.slice(0, -1).every((r) => !r.isGoal)).toBe(true);
  });

  it("counts up for weight gain — the opposite, not the same list", () => {
    // Someone asking to gain being handed "Down 5 lb" on their first screen
    // is the exact failure goalDirection exists to prevent.
    const l = weightLadder({ startWeight: 140, goalWeight: 155, direction: "gain", units: "imperial" });
    expect(targets(l)).toEqual([145, 150, 155]);
    expect(rungTitle(l[0], "gain", "lb")).toBe("Up 5 lb");
    expect(rungTitle(l[0], "lose", "lb")).toBe("Down 5 lb");
    expect(rungTitle(l.at(-1)!, "gain", "lb")).toBe("Goal: 155 lb");
  });

  it("builds nothing at all for a goal she is already at", () => {
    // "Get to 75" and "stay at 75" are the same request, and inventing rungs
    // for it is the app making up a journey she did not ask to take.
    expect(weightLadder({ startWeight: 165, goalWeight: 165, direction: "hold", units: "imperial" }))
      .toEqual([]);
    // Direction is passed in, never re-derived: a "hold" whose numbers differ
    // slightly still gets no ladder.
    expect(weightLadder({ startWeight: 165, goalWeight: 164, direction: "hold", units: "imperial" }))
      .toEqual([]);
  });

  it("refuses to build one when the direction and the numbers disagree", () => {
    // Two sources disagreeing about what she asked for. Picking either one
    // silently is how someone is handed the opposite of their own request.
    expect(weightLadder({ startWeight: 180, goalWeight: 160, direction: "gain", units: "imperial" }))
      .toEqual([]);
    expect(weightLadder({ startWeight: 140, goalWeight: 155, direction: "lose", units: "imperial" }))
      .toEqual([]);
  });

  it("refuses to guess when a number is missing", () => {
    const args = { direction: "lose" as const, units: "imperial" as const };
    expect(weightLadder({ startWeight: null, goalWeight: 160, ...args })).toEqual([]);
    expect(weightLadder({ startWeight: 180, goalWeight: null, ...args })).toEqual([]);
    expect(weightLadder({ startWeight: undefined, goalWeight: undefined, ...args })).toEqual([]);
  });

  it("uses the number people say out loud, per unit system", () => {
    expect(LADDER_STEP.imperial).toBe(5);
    expect(LADDER_STEP.metric).toBe(2);
    const m = weightLadder({ startWeight: 82, goalWeight: 74, direction: "lose", units: "metric" });
    expect(targets(m)).toEqual([80, 78, 76, 74]);
    // Not a converted 5 lb: "Down 2.3 kg" is not a milestone anybody celebrates.
    expect(m.every((r) => Number.isInteger(r.moved))).toBe(true);
  });
});

suite("a ladder always reaches the goal", () => {
  it("widens the step rather than stopping short", () => {
    // 100 lb at 5 a rung is twenty rungs. Truncating would quietly redefine
    // the goal as wherever the list stopped.
    const l = weightLadder({ startWeight: 280, goalWeight: 180, direction: "lose", units: "imperial" });
    expect(l.length).toBeLessThanOrEqual(MAX_RUNGS);
    expect(l.at(-1)!.target).toBe(180);
    expect(l.at(-1)!.isGoal).toBe(true);
    // Still round numbers — whole multiples of five, never 6.7.
    expect(l.every((r) => r.moved % 5 === 0)).toBe(true);
  });

  it("ends on the goal exactly, even when it is not on a step", () => {
    const l = weightLadder({ startWeight: 180, goalWeight: 167, direction: "lose", units: "imperial" });
    expect(targets(l)).toEqual([175, 170, 167]);
    expect(l.at(-1)!.isGoal).toBe(true);
  });

  it("is one rung when the goal is closer than a step", () => {
    const l = weightLadder({ startWeight: 180, goalWeight: 177, direction: "lose", units: "imperial" });
    expect(targets(l)).toEqual([177]);
  });
});

suite("a rung is reached on the trend, not on a morning", () => {
  const l = weightLadder({ startWeight: 180, goalWeight: 165, direction: "lose", units: "imperial" });

  it("passes when the trend is at or past it", () => {
    expect(rungReached(l[0], 175, "lose")).toBe(true);
    expect(rungReached(l[0], 175.1, "lose")).toBe(false);
    expect(rungReached(l[0], 174, "lose")).toBe(true);
  });

  it("reads the other way for a gain", () => {
    const up = weightLadder({ startWeight: 140, goalWeight: 155, direction: "gain", units: "imperial" });
    expect(rungReached(up[0], 146, "gain")).toBe(true);
    expect(rungReached(up[0], 144, "gain")).toBe(false);
  });

  it("says no rather than yes when there is no trend to read", () => {
    // Unknown is not zero, and here zero would read as "reached" for a loss.
    expect(rungReached(l[0], null, "lose")).toBe(false);
    expect(rungReached(l[0], Number.NaN, "lose")).toBe(false);
  });

  it("names the next one, and nothing once the ladder is done", () => {
    expect(nextRung(l, 178, "lose")?.target).toBe(175);
    expect(nextRung(l, 172, "lose")?.target).toBe(170);
    expect(nextRung(l, 160, "lose")).toBeNull();
  });

  it("measures progress from the rung below, not from the start", () => {
    // From the start, every bar late in a long ladder sits at 90% and never
    // visibly moves.
    expect(rungProgress(l, l[0], 177.5, 180)).toBeCloseTo(0.5);
    expect(rungProgress(l, l[1], 177.5, 180)).toBe(0);
    expect(rungProgress(l, l[1], 172.5, 180)).toBeCloseTo(0.5);
    expect(rungProgress(l, l[0], null, 180)).toBeNull();
  });
});

suite("the ladder is wired to the goal, in both directions", () => {
  it("is laid out during onboarding, from her own answers", () => {
    expect(read("app/api/onboard/route.ts")).toMatch(/runTool\("set_weight_milestones", \{\}, ctx\)/);
  });

  it("is rebuilt whenever the goal or the start moves", () => {
    const src = read("lib/tools/profile.ts");
    expect(src).toMatch(/if \(patch\.goalWeightKg !== undefined \|\| patch\.startWeightKg !== undefined\) \{/);
    expect(src).toMatch(/await rebuildWeightLadder\(ctx\.profileId\)/);
  });

  it("never deletes what she wrote herself, or what she has already reached", () => {
    const src = read("lib/tools/profile.ts");
    const fn = src.slice(src.indexOf("export async function rebuildWeightLadder"),
      src.indexOf("export async function settleWeightLadder"));
    // Only the automatic ones are even looked at.
    expect(fn).toMatch(/eq\(goals\.source, "auto"\)/);
    // And of those, only the unreached ones are removed.
    expect(fn).toMatch(/const stale = existing\.filter\(\(g\) => g\.achievedAt === null\)/);
    expect(fn).toMatch(/inArray\(goals\.id, stale\.map\(\(g\) => g\.id\)\)/);
    // Destroying data is audited.
    expect(fn).toMatch(/audit\("data\.deleted"/);
  });

  it("settles on the trend, and only ever on the trend", () => {
    const src = read("lib/tools/profile.ts");
    const fn = src.slice(src.indexOf("export async function settleWeightLadder"),
      src.indexOf("export const setWeightMilestones"));
    expect(fn).toMatch(/weightTrend\(/);
    expect(fn).toMatch(/const trendKg = trend\.trendKg/);
    // No trend, no claim.
    expect(fn).toMatch(/if \(trendKg === null\) return \[\]/);
    // A weigh-in is what triggers it.
    expect(src).toMatch(/const justHit = await settleWeightLadder\(ctx\.profileId\)/);
  });

  it("tells the coach what she has just hit, once", () => {
    const p = read("lib/progress.ts");
    expect(p).toMatch(/SHE HAS JUST REACHED, and has not been told/);
    expect(p).toMatch(/eq\(goals\.celebrated, false\)/);
    // achieve_goal is what records that it has been said.
    expect(read("lib/tools/profile.ts")).toMatch(/celebrated: true/);
  });
});

suite("an account that predates the ladder still gets one", () => {
  it("builds it once, on read, through the tool and never with a model call", () => {
    const page = read("app/progress/page.tsx");
    expect(page).toMatch(/!milestones\.some\(\(m\) => m\.source === "auto"\)/);
    expect(page).toMatch(/runTool\("set_weight_milestones", \{\}, \{ profileId: profile\.id \}\)/);
    // A goal she is already at has no rungs by design; that is not "missing",
    // and treating it as missing would rebuild on every single page load.
    expect(page).toMatch(/direction !== "hold" &&/);
  });
});

suite("the goal is hers to change", () => {
  it("is editable on Progress, and rebuilds the rungs when it moves", () => {
    const card = read("components/goal-card.tsx");
    expect(card).toMatch(/action\("update_profile", \{ goalWeight: weight/);
    expect(card).toMatch(/action\("set_weight_milestones", \{\}\)/);
    // Said out loud, because it is what she is agreeing to.
    expect(card).toMatch(/Ones you have already hit stay hit/);
  });

  it("only lets her delete the ones she wrote", () => {
    // Deleting the middle of a countdown leaves a countdown with a hole in it.
    const card = read("components/goal-card.tsx");
    expect(card).toMatch(/\{!r\.auto && \(/);
    expect(card).toMatch(/action\("remove_goal", \{ goalId: id \}\)/);
  });

  it("announces its failures rather than colouring them", () => {
    expect(read("components/goal-card.tsx")).toMatch(/role="alert"/);
  });
});
