import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  activityState, cartwheelPose, cartwheelSpin, celebratePose, FAR, idlePose, lerpJoints,
  NEAR, nextActivity, phaseFor, reactionFor, setPose, stridePose, thinkPose, travel,
  unimpressedPose, wavePose,
  type Activity, type Pose,
} from "@/lib/companion";
import { PATTERNS } from "@/lib/movement-patterns";

/**
 * The figure at the bottom of the screen. All of his behaviour is pure —
 * poses are functions of a phase, and what he does next is a function of what
 * he was doing and a random number — which is the only way a wandering
 * animation can be checked by anything but watching it.
 */
const points = (p: Pose): [number, number][] => [
  p.head, p.shoulder, p.hip,
  p.armL.elbow, p.armL.hand, p.armR.elbow, p.armR.hand,
  p.legL.knee, p.legL.foot, p.legR.knee, p.legR.foot,
];
const finite = (p: Pose) => points(p).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

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
      expect(finite(stridePose(p)), `walk ${p}`).toBe(true);
      expect(finite(stridePose(p, 1.9)), `run ${p}`).toBe(true);
      expect(finite(idlePose(p)), `idle ${p}`).toBe(true);
      expect(finite(wavePose(p)), `wave ${p}`).toBe(true);
      expect(finite(thinkPose(p)), `think ${p}`).toBe(true);
      expect(finite(celebratePose(p)), `celebrate ${p}`).toBe(true);
      expect(finite(unimpressedPose(p)), `unimpressed ${p}`).toBe(true);
      expect(finite(setPose("squat", p)), `set ${p}`).toBe(true);
    }
  });

  it("has two legs, and they are not welded together", () => {
    // One leg reads as a hop and one arm reads as an injury.
    let apart = 0;
    for (let p = 0; p <= 1; p += 0.02) {
      const s = stridePose(p);
      if (Math.abs(s.legL.foot[0] - s.legR.foot[0]) > 4) apart++;
      if (Math.abs(s.armL.hand[0] - s.armR.hand[0]) > 3) apart++;
    }
    expect(apart).toBeGreaterThan(40);
  });

  it("swings the arms opposite the legs, the way walking works", () => {
    for (const p of [0.1, 0.35, 0.6, 0.85]) {
      const s = stridePose(p);
      const legLead = s.legR.foot[0] - s.legL.foot[0];
      const armLead = s.armR.hand[0] - s.armL.hand[0];
      expect(Math.sign(legLead), `phase ${p}`).not.toBe(Math.sign(armLead));
    }
  });

  it("runs at a different tempo from walking, so nothing reads as one loop", () => {
    // Everything ran on one two-second cycle before, which is exactly what
    // made it look like a loop.
    const rates = (["walk", "laps", "set", "idle", "wave"] as Activity[])
      .map((a) => phaseFor(a, 0.5));
    expect(new Set(rates).size).toBe(rates.length);
    // Running cycles faster than walking.
    expect(phaseFor("laps", 0.5)).toBeGreaterThan(phaseFor("walk", 0.5));
    expect(phaseFor("walk", 0.5)).toBeGreaterThan(phaseFor("idle", 0.5));
  });

  it("actually move — a still figure is a broken one", () => {
    const moved = (a: Pose, b: Pose) =>
      points(a).some((p, i) => p[0] !== points(b)[i][0] || p[1] !== points(b)[i][1]);
    expect(moved(stridePose(0), stridePose(0.25))).toBe(true);
    expect(moved(wavePose(0), wavePose(0.2))).toBe(true);
    expect(moved(celebratePose(0.05), celebratePose(0.2))).toBe(true);
    expect(moved(setPose("squat", 0), setPose("squat", 0.12))).toBe(true);
    // Running throws further than walking.
    const peak = (intensity: number) => {
      let most = 0;
      for (let p = 0; p <= 1; p += 0.01) most = Math.max(most, Math.abs(stridePose(p, intensity).legR.foot[0] - 50));
      return most;
    };
    expect(peak(1.9)).toBeGreaterThan(peak(1));
  });

  it("a rep goes out and comes back rather than snapping", () => {
    const squat = PATTERNS.squat;
    expect(setPose("squat", 0).legR.knee[1]).toBeCloseTo(squat.start.knee[1] + 0, 0);
    // Out to the bottom and back to the top within a quarter of the cycle:
    // the deepest point of the rep is nearer the end pose than the start,
    // and a quarter-cycle later it is back where it began.
    // A rep is half a phase cycle: down to the end pose by 0.25, back to the
    // start by 0.5, so he does two reps per cycle.
    expect(setPose("squat", 0.25).legR.knee[1]).toBeCloseTo(squat.end.knee[1], 0);
    expect(setPose("squat", 0.5).legR.knee[1]).toBeCloseTo(squat.start.knee[1], 0);
    // And it eases through the bottom rather than snapping to it.
    const quarter = setPose("squat", 0.125).legR.knee[1];
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

  it("leads her to the page's own coach panel, which is the one entry point", () => {
    // Not a floating window: the app deliberately has one coach entry per
    // screen, and it is the one that knows what screen it is on.
    expect(read("components/companion.tsx")).toMatch(/new CustomEvent\("coach:open"\)/);
    // Two shapes of coach entry across the app, and both answer him: the
    // inline panel on the screens that have one, and the header button that
    // opens a sheet on the screens that do not.
    const ask = read("components/ask-coach.tsx");
    expect(ask).toMatch(/addEventListener\("coach:open", come\)/);
    expect(ask).toMatch(/scrollIntoView\(\{ behavior: "smooth"/);
    expect(ask).toMatch(/data-ask-coach=""/);
    const opinion = read("components/ai-opinion.tsx");
    expect(opinion).toMatch(/addEventListener\("coach:open", ask\)/);
    expect(opinion).toMatch(/data-ask-coach=""/);
  });

  it("does nothing on the one screen with nowhere to send her", () => {
    // Offering a tap that does nothing is worse than not offering it.
    const c = read("components/companion.tsx");
    expect(c).toMatch(/document\.querySelector\("\[data-ask-coach\]"\)/);
    // Always the same element, never a div that becomes a button: changing
    // the type remounts the svg and leaves the frame loop writing into
    // detached nodes — which is what reduced him to a motionless head.
    expect(c).not.toMatch(/const Stage =/);
    expect(c).toMatch(/if \(!parts\.current\.spine\?\.isConnected\)/);
  });

  it("stops and thinks while the coach is working", () => {
    // The one moment his behaviour means something, and it means what it
    // looks like.
    expect(read("lib/use-coach-thread.ts")).toMatch(/new CustomEvent\("coach:busy"\)/);
    expect(read("lib/use-coach-thread.ts")).toMatch(/new CustomEvent\("coach:idle"\)/);
    const c = read("components/companion.tsx");
    expect(c).toMatch(/addEventListener\("coach:busy", busyOn\)/);
    expect(c).toMatch(/interrupt\("think"\)/);
  });

  it("is not on the screens with no chrome, and holds a pose for reduced motion", () => {
    const c = read("components/companion.tsx");
    expect(c).toMatch(/if \(isChromeless\(path\)\) return null;/);
    expect(c).toMatch(/prefers-reduced-motion: reduce/);
    expect(c).toMatch(/if \(!still\) raf = window\.requestAnimationFrame\(frame\)/);
  });
});

suite("he works the room", () => {
  it("carries on from where he is instead of teleporting to the middle", () => {
    // Every activity used to start at x=50, so finishing a lap at the far end
    // and starting a set put him back in the centre between two frames.
    for (const a of ["set", "wave", "idle", "think", "celebrate"] as Activity[]) {
      expect(activityState(a, 0.5, 91).x, a).toBe(91);
      expect(travel(activityState(a, 0.5, 91), 5).x, a).toBe(91);
    }
    expect(nextActivity("laps", 0.5, 0.5, 91).x).toBe(91);
  });

  it("walks to whichever end he is not at, so the sets land at both", () => {
    expect(activityState("walk", 0.5, 90).toX).toBe(NEAR);
    expect(activityState("walk", 0.5, 10).toX).toBe(FAR);
    expect(activityState("cartwheel", 0.5, 90).toX).toBe(NEAR);
  });

  it("cartwheels across the floor, turning as he goes", () => {
    const s = activityState("cartwheel", 0.5, 8);
    expect(travel(s, 0).x).toBeCloseTo(8);
    expect(travel(s, s.duration).x).toBeCloseTo(FAR);
    // Two full turns across, and it goes round rather than back and forth.
    expect(cartwheelSpin(0)).toBe(0);
    // One turn per crossing: at two it read as spinning rather than as a
    // body going over its hands.
    expect(cartwheelSpin(1)).toBe(360);
    expect(cartwheelSpin(0.5)).toBeGreaterThan(cartwheelSpin(0.25));
    for (let p = 0; p <= 1; p += 0.1) expect(finite(cartwheelPose(p)), `${p}`).toBe(true);
    // Four beats — hand, hand, foot, foot — so the limbs reach in turn
    // rather than the whole star rotating rigidly.
    const reach = (p: number) => {
      const c = cartwheelPose(p);
      return [c.armL.hand[0], c.armR.hand[0], c.legL.foot[0], c.legR.foot[0]].map((v) => Math.abs(v - 50));
    };
    const spans = [0, 0.25, 0.5, 0.75].map((p) => reach(p));
    // Each beat has a different limb furthest out.
    const furthest = spans.map((r) => r.indexOf(Math.max(...r)));
    expect(new Set(furthest).size).toBeGreaterThan(2);
  });

  it("draws by writing attributes, not by re-rendering sixty times a second", () => {
    // The first version called setState per frame and took the whole tree
    // with it, which is what "janky" was.
    const c = fs.readFileSync("components/companion.tsx", "utf8");
    const loop = c.slice(c.indexOf("const frame = (now: number)"), c.indexOf("raf = window.requestAnimationFrame(frame);"));
    expect(loop).not.toMatch(/setState|setPoseState|setX\(|setFacing\(/);
    expect(c).toMatch(/querySelectorAll<SVGElement>\("\[data-part\]"\)/);
  });
});

suite("how he takes a set", () => {
  it("is pleased when it beat last time, whatever the tone", () => {
    for (const tone of ["encouraging", "plain", "hype"] as const) {
      expect(reactionFor("beat", 2, tone), tone).toBe("celebrate");
    }
  });

  it("never turns on her for a first attempt", () => {
    // Meeting a new movement with a shrug is how someone stops trying them.
    for (const tone of ["encouraging", "plain", "hype"] as const) {
      expect(reactionFor("first", 3, tone), tone).toBe("wave");
    }
  });

  it("is harder on a slack set the blunter the tone is", () => {
    // Three or more left in the tank on a set that did not beat the last one.
    expect(reactionFor("matched", 3, "encouraging")).toBe("wave");
    expect(reactionFor("matched", 3, "plain")).toBe("unimpressed");
    expect(reactionFor("matched", 3, "hype")).toBe("unimpressed");
    // The gym floor is the only one that minds a set that was merely fine.
    expect(reactionFor("matched", 0, "hype")).toBe("unimpressed");
    expect(reactionFor("matched", 0, "plain")).toBe("wave");
    // And the encouraging one never gets cross at all.
    expect(reactionFor("missed", 3, "encouraging")).toBe("wave");
    expect(reactionFor("missed", 0, "hype")).toBe("unimpressed");
  });

  it("copes with her not saying what was left", () => {
    expect(reactionFor("matched", null, "hype")).toBe("unimpressed");
    expect(reactionFor("matched", null, "plain")).toBe("wave");
  });
});
