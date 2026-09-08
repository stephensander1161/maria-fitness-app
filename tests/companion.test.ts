import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  activityState, idlePose, lerpJoints, nextActivity, setPose, thinkPose, travel, walkPose, wavePose,
  type Activity,
} from "@/lib/companion";
import { PATTERNS } from "@/lib/movement-patterns";

/**
 * The figure at the bottom of the screen. All of his behaviour is pure —
 * poses are functions of a phase, and what he does next is a function of what
 * he was doing and a random number — which is the only way a wandering
 * animation can be checked by anything but watching it.
 */
const joints = ["head", "shoulder", "elbow", "hand", "hip", "knee", "foot"] as const;
const finite = (j: Record<string, [number, number]>) =>
  joints.every((k) => j[k].every((n) => Number.isFinite(n)));

suite("what he does next", () => {
  it("never repeats what he has just finished", () => {
    // Four sets of squats in a row, standing still, reads as a stuck loop.
    for (const previous of ["walk", "set", "laps", "idle", "wave"] as Activity[]) {
      for (let r = 0; r < 1; r += 0.05) {
        expect(nextActivity(previous, r).activity, `${previous} @ ${r}`).not.toBe(previous);
      }
    }
  });

  it("spends most of its time wandering rather than flitting", () => {
    const counts = new Map<Activity, number>();
    for (let i = 0; i < 2000; i++) {
      const a = nextActivity("idle", i / 2000).activity;
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    // Every activity gets a turn…
    for (const a of ["walk", "set", "laps", "wave"] as Activity[]) {
      expect(counts.get(a) ?? 0, a).toBeGreaterThan(0);
    }
    // …and walking is the commonest.
    expect(counts.get("walk")!).toBeGreaterThan(counts.get("wave")!);
  });

  it("survives a roll at either end of the range", () => {
    for (const r of [0, 0.999, 1, -1, 2]) {
      expect(nextActivity("idle", r).duration).toBeGreaterThan(0);
    }
  });

  it("gives every activity a real duration and a movement to do", () => {
    for (const a of ["walk", "laps", "set", "wave", "think", "idle"] as Activity[]) {
      const s = activityState(a, 0.5);
      expect(s.duration, a).toBeGreaterThan(1);
      expect(PATTERNS[s.pattern], a).toBeDefined();
    }
    // A set picks from the movements, whatever the roll.
    for (let r = 0; r < 1; r += 0.07) {
      expect(PATTERNS[activityState("set", r).pattern]).toBeDefined();
    }
  });
});

suite("where he is", () => {
  it("walks once and stays", () => {
    const s = { ...activityState("walk", 0.5), x: 10, toX: 90 };
    expect(travel(s, 0).x).toBeCloseTo(10);
    expect(travel(s, s.duration).x).toBeCloseTo(90);
    expect(travel(s, s.duration * 2).x).toBeCloseTo(90); // clamped, not past the end
    expect(travel(s, 1).facing).toBe(1);
    expect(travel({ ...s, x: 90, toX: 10 }, 1).facing).toBe(-1);
  });

  it("runs laps end to end and turns round", () => {
    const s = activityState("laps", 0.5);
    const out = travel(s, 0);
    const far = travel(s, 4);
    const back = travel(s, 8);
    expect(out.x).toBeLessThan(far.x);
    expect(far.x).toBeGreaterThan(80);
    expect(back.x).toBeCloseTo(out.x, 0);
    // He faces the way he is going.
    expect(travel(s, 2).facing).toBe(1);
    expect(travel(s, 6).facing).toBe(-1);
  });

  it("stays put for everything that is not travelling", () => {
    for (const a of ["set", "wave", "think", "idle"] as Activity[]) {
      const s = { ...activityState(a, 0.5), x: 33 };
      expect(travel(s, 99).x, a).toBe(33);
    }
  });

  it("never leaves the stage", () => {
    for (const a of ["walk", "laps"] as Activity[]) {
      for (let r = 0; r < 1; r += 0.05) {
        const s = activityState(a, r);
        for (let t = 0; t < s.duration; t += 0.3) {
          const { x } = travel(s, t);
          expect(x, `${a} @ ${r}/${t}`).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

suite("the poses", () => {
  it("are drawable at every phase", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      expect(finite(walkPose(p)), `walk ${p}`).toBe(true);
      expect(finite(walkPose(p, true)), `run ${p}`).toBe(true);
      expect(finite(idlePose(p)), `idle ${p}`).toBe(true);
      expect(finite(wavePose(p)), `wave ${p}`).toBe(true);
      expect(finite(thinkPose(p)), `think ${p}`).toBe(true);
      expect(finite(setPose("squat", p)), `set ${p}`).toBe(true);
    }
  });

  it("actually move — a still figure is a broken one", () => {
    const moved = (a: ReturnType<typeof walkPose>, b: ReturnType<typeof walkPose>) =>
      joints.some((k) => a[k][0] !== b[k][0] || a[k][1] !== b[k][1]);
    // Not 0.25: the stride is a sine over two cycles, so phase 0 and phase
    // 0.25 are both the moment the legs pass each other — the same pose.
    expect(moved(walkPose(0), walkPose(0.125))).toBe(true);
    expect(moved(wavePose(0), wavePose(0.2))).toBe(true);
    expect(moved(setPose("squat", 0), setPose("squat", 0.12))).toBe(true);
    // Running throws further than walking. Compared at each gait's own peak
    // — they swing at different rates, so the same phase is not the same
    // point of the stride.
    const peak = (running: boolean) => {
      let most = 0;
      for (let p = 0; p <= 1; p += 0.01) most = Math.max(most, Math.abs(walkPose(p, running).foot[0] - 50));
      return most;
    };
    expect(peak(true)).toBeGreaterThan(peak(false));
  });

  it("a rep goes out and comes back rather than snapping", () => {
    const squat = PATTERNS.squat;
    expect(setPose("squat", 0).knee[1]).toBeCloseTo(squat.start.knee[1], 0);
    // Out to the bottom and back to the top within a quarter of the cycle:
    // the deepest point of the rep is nearer the end pose than the start,
    // and a quarter-cycle later it is back where it began.
    // A rep is half a phase cycle: down to the end pose by 0.25, back to the
    // start by 0.5, so he does two reps per cycle.
    expect(setPose("squat", 0.25).knee[1]).toBeCloseTo(squat.end.knee[1], 0);
    expect(setPose("squat", 0.5).knee[1]).toBeCloseTo(squat.start.knee[1], 0);
    // And it eases through the bottom rather than snapping to it.
    const quarter = setPose("squat", 0.125).knee[1];
    expect(quarter).toBeLessThan(squat.start.knee[1]);
    expect(quarter).toBeGreaterThan(squat.end.knee[1]);
  });

  it("lerps between two poses", () => {
    const a = PATTERNS.squat.start;
    const b = PATTERNS.squat.end;
    expect(lerpJoints(a, b, 0)).toEqual(a);
    expect(lerpJoints(a, b, 1)).toEqual(b);
    expect(lerpJoints(a, b, 0.5).hip[1]).toBeCloseTo((a.hip[1] + b.hip[1]) / 2);
  });
});

suite("he is the way in to the coach", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("opens the conversation when tapped, without either knowing about the other", () => {
    expect(read("components/companion.tsx")).toMatch(/new CustomEvent\("coach:open"\)/);
    expect(read("components/coach-bubble.tsx")).toMatch(/addEventListener\("coach:open", openIt\)/);
  });

  it("stops and thinks while the coach is working", () => {
    // The one moment his behaviour means something, and it means what it
    // looks like.
    expect(read("lib/use-coach-thread.ts")).toMatch(/new CustomEvent\("coach:busy"\)/);
    expect(read("lib/use-coach-thread.ts")).toMatch(/new CustomEvent\("coach:idle"\)/);
    const c = read("components/companion.tsx");
    expect(c).toMatch(/addEventListener\("coach:busy", on\)/);
    expect(c).toMatch(/activityState\("think", 0\.5\)/);
  });

  it("is not on the screens with no chrome, and holds a pose for reduced motion", () => {
    const c = read("components/companion.tsx");
    expect(c).toMatch(/if \(isChromeless\(path\)\) return null;/);
    expect(c).toMatch(/prefers-reduced-motion: reduce/);
    expect(c).toMatch(/if \(!still\) raf = window\.requestAnimationFrame\(frame\)/);
  });
});
