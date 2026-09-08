import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  activityState, celebratePose, FAR, idlePose, lerpJoints,
  NEAR, nextActivity, phaseFor, reactionFor, setPose, sleepPose, stridePose, thinkPose, travel,
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
    for (const a of ["walk", "laps", "wave"] as Activity[]) {
      expect(counts.get(a) ?? 0, a).toBeGreaterThan(0);
    }
    // …and walking is the commonest.
    expect(counts.get("walk")!).toBeGreaterThan(counts.get("wave")!);
    // But no sets: she is not training, and reps performed at nobody is the
    // difference between a companion and a screensaver.
    expect(counts.get("set") ?? 0).toBe(0);
  });

  it("does sets when she is in a session, and mostly sets", () => {
    const counts = new Map<Activity, number>();
    for (let i = 0; i < 2000; i++) {
      const a = nextActivity("idle", i / 2000, 0.5, 50, false, "training").activity;
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    expect(counts.get("set")!).toBeGreaterThan(counts.get("walk") ?? 0);
    expect(counts.get("sleep") ?? 0).toBe(0);
  });

  it("asleep is not one activity among several — it is all of them", () => {
    for (let i = 0; i < 50; i++) {
      expect(nextActivity("walk", i / 50, 0.5, 50, false, "asleep").activity).toBe("sleep");
    }
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
    // From the near end there is no run-up, so this is a clean lap: out in
    // four seconds, back in the next four.
    const s = activityState("laps", 0.5, NEAR);
    const out = travel(s, 0);
    const far = travel(s, 4);
    const back = travel(s, 8);
    expect(out.x).toBeCloseTo(NEAR, 5);
    expect(far.x).toBeGreaterThan(80);
    expect(back.x).toBeCloseTo(NEAR, 0);
    // He faces the way he is going.
    expect(travel(s, 2).facing).toBe(1);
    expect(travel(s, 6).facing).toBe(-1);
  });

  it("and runs *to* the track from wherever he was standing", () => {
    // Starting mid-floor, the first thing he does is cover the ground to an
    // end — at lap pace, so it reads as part of the run rather than a jump.
    const s = activityState("laps", 0.5, 50);
    expect(travel(s, 0).x).toBeCloseTo(50, 5);
    expect(travel(s, 1).x).toBeGreaterThan(50);
    expect(travel(s, 2).x).toBeCloseTo(FAR, 0);
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

  it("has a chat window to open — which is where this went wrong", () => {
    // The listener was added to CoachBubble and CoachBubble was mounted
    // precisely nowhere: the gate was written, exported, and never called, so
    // on every screen in the app there was no chat window for him to open.
    // Nothing caught it, because nothing checked.
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/<CoachBubbleGate \/>/);
    expect(layout).toMatch(/import \{ CoachBubbleGate \} from "@\/components\/coach-bubble-gate"/);
    expect(read("components/coach-bubble-gate.tsx")).toMatch(/<CoachBubble name=/);
  });

  it("is the only trigger — the sheet draws no button of its own", () => {
    // He *is* the button. Two coach triggers on one screen is one too many,
    // which is why the floating bubble was retired in the first place.
    const bubble = read("components/coach-bubble.tsx");
    expect(bubble).toMatch(/\{!open && float && \(/);
    expect(bubble).toMatch(/float = false/);
    expect(read("components/coach-bubble-gate.tsx")).not.toMatch(/float=/);
  });

  it("has nothing inside him to select instead of press", () => {
    // iOS reads a press-and-hold on real text as "select this" and puts a
    // Copy / Search callout over the top, which eats the tap. His
    // screen-reader label used to be a <span> of real text inside the button.
    const c = read("components/companion.tsx");
    expect(c).not.toMatch(/<span className="sr-only">\{label\}<\/span>/);
    expect(c).toMatch(/aria-label=\{label\}/);
    expect(c).toMatch(/className="tap-only group block/);
    const css = read("app/globals.css");
    const rule = css.slice(css.indexOf(".tap-only {"), css.indexOf("}", css.indexOf(".tap-only {")));
    expect(rule).toMatch(/-webkit-touch-callout: none/);
    expect(rule).toMatch(/user-select: none/);
    expect(rule).toMatch(/touch-action: manipulation/);
  });

  it("opens the chat window, on every screen", () => {
    // He used to shout at a room with nobody in it. The only listeners were
    // the inline panels — not on every screen, and up in the header when they
    // are — so on most screens the tap did nothing, and on the rest something
    // opened off-screen above her.
    expect(read("components/companion.tsx")).toMatch(/new CustomEvent\("coach:open"\)/);
    const bubble = read("components/coach-bubble.tsx");
    expect(bubble).toMatch(/addEventListener\("coach:open", come\)/);
    expect(bubble).toMatch(/const come = \(\) => setOpen\(true\)/);
  });

  it("and one surface answers, not two", () => {
    // Both inline panels used to listen for the same event, so on a screen
    // with one, a tap opened a panel *and* the sheet.
    expect(read("components/ask-coach.tsx")).not.toMatch(/addEventListener\("coach:open"/);
    expect(read("components/ai-opinion.tsx")).not.toMatch(/addEventListener\("coach:open"/);
  });

  it("is tappable without sniffing the DOM for permission first", () => {
    // The query ran once, on the frame after mount — which on a soft
    // navigation is before the next page has rendered. It found nothing, and
    // rendered him aria-hidden with no handler at all.
    const c = read("components/companion.tsx");
    expect(c).not.toMatch(/document\.querySelector\("\[data-ask-coach\]"\)/);
    expect(c).not.toMatch(/hasPanel/);
    expect(c).toMatch(/onClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\("coach:open"\)\)\}/);
    expect(c).not.toMatch(/const Stage =/);
    expect(c).toMatch(/if \(!parts\.current\.spine\?\.isConnected\)/);
  });

  it("stops and thinks while the coach is working", () => {
    // The one moment his behaviour means something, and it means what it
    // looks like.
    expect(read("lib/use-coach-thread.ts")).toMatch(/new CustomEvent\("coach:busy"\)/);
    expect(read("lib/use-coach-thread.ts")).toMatch(/new CustomEvent\("coach:idle"\)/);
    const c = read("components/companion.tsx");
    expect(c).toMatch(/addEventListener\("coach:busy", on\)/);
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
  });

  it("sleeps lying down, and stays put while he does", () => {
    // A figure that is merely motionless reads as broken. Lying on the floor
    // is what makes a still companion look like a resting one.
    const s = activityState("sleep", 0.5, 30);
    expect(travel(s, 0).x).toBeCloseTo(30);
    expect(travel(s, s.duration).x).toBeCloseTo(30);
    // Long enough to be a sleep rather than a blink.
    expect(s.duration).toBeGreaterThan(15);
    for (let p = 0; p <= 1; p += 0.1) expect(finite(sleepPose(p)), `${p}`).toBe(true);
    // Horizontal: his head is down at floor level and off to one side, not
    // stacked above his hips the way every standing pose has it.
    const pose = sleepPose(0.5);
    expect(pose.head[1]).toBeGreaterThan(70);
    expect(Math.abs(pose.head[0] - pose.hip[0])).toBeGreaterThan(15);
    // And breathing, or it is a corpse.
    expect(sleepPose(0.25).shoulder[1]).not.toBeCloseTo(sleepPose(0.75).shoulder[1]);
  });

  it("has no cartwheel — it looked like spinning, not like a body going over", () => {
    const picks = new Set(
      Array.from({ length: 400 }, (_, i) => nextActivity("idle", i / 400, 0.5, 50).activity),
    );
    expect(picks.has("cartwheel" as Activity)).toBe(false);
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

suite("his world", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");
  const c = read("components/companion.tsx");

  it("is as wide as the strip, not a square in the middle of it", () => {
    // A 100×100 viewBox in a wide short box letterboxes to a centred square,
    // which is why he was pacing a tiny track.
    expect(c).toMatch(/const STAGE_W = 300/);
    expect(c).toMatch(/viewBox=\{`0 0 \$\{STAGE_W\} 100`\}/);
    expect(c).toMatch(/const at = x \* \(STAGE_W \/ 100\)/);
  });

  it("is one of him, sized by what she has actually trained", () => {
    // He was briefly a crowd with buttons to add and remove, which was funny
    // for a day and then was a row of strangers doing star jumps under her
    // session. One figure can mean something.
    expect(c).not.toMatch(/MAX_CREW|CREW_KEY|aria-label="One more"|aria-label="One fewer"/);
    expect(c).toMatch(/<Walker index=\{0\} tone=\{tone\} busy=\{busy\} crowded=\{false\} scale=\{scale\} mode=\{showing\} \/>/);
    // Scaled about his feet, or a bigger figure hovers above the floor line.
    expect(c).toMatch(/translate\(50 96\) scale\(\$\{k\}\) translate\(-50 -96\)/);
  });

  it("gives each of them their own loop, so a crew is not one animation six times", () => {
    expect(c).toMatch(/function Walker\(/);
    expect(c).toMatch(/startedAt\.current = performance\.now\(\) - index \* 900/);
    expect(c).toMatch(/activityState\("walk", \(index \* 0\.37\) % 1/);
  });
});

suite("a crowd", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("turns into a boxing gym once there is no room to run", () => {
    // Figures cartwheeling through each other looks broken; figures throwing
    // jabs on the spot looks deliberate.
    const crowdedPicks = new Set(
      Array.from({ length: 400 }, (_, i) => nextActivity("idle", i / 400, 0.5, 50, true).activity),
    );
    expect(crowdedPicks.has("spar")).toBe(true);
    // Nothing that needs the floor to itself.
    expect(crowdedPicks.has("laps")).toBe(false);
    expect(crowdedPicks.has("walk")).toBe(false);
  });

  it("and goes back to wandering when it thins out", () => {
    const roomy = new Set(
      Array.from({ length: 400 }, (_, i) => nextActivity("idle", i / 400, 0.5, 50, false).activity),
    );
    expect(roomy.has("walk")).toBe(true);
    expect(roomy.has("laps")).toBe(true);
    expect(roomy.has("spar")).toBe(false);
  });

  it("spars on the spot, with the punches", () => {
    const s = activityState("spar", 0.5, 70);
    expect(s.pattern).toBe("punch");
    expect(s.x).toBe(70);
    expect(travel(s, 99).x).toBe(70);
    // Faster than a set, because it is not one.
    expect(phaseFor("spar", 0.5)).toBeGreaterThan(phaseFor("set", 0.5));
  });

  it("gives each of them their own colour, and leaves the first one alone", () => {
    // He is the coach; changing colour when a friend turns up would read as
    // a different person.
    const c = read("components/companion.tsx");
    expect(c).toMatch(/function hueFor\(index: number\)/);
    expect(c).toMatch(/if \(index === 0\) return undefined;/);
    expect(c).toMatch(/hsl\(\$\{\(index \* 47\) % 360\} 70% 62%\)/);
    expect(c).toMatch(/style=\{\{ color: hueFor\(index\) \}\}/);
  });
});

suite("what he says and how big he is", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("reads it all off her own rows, on the server", () => {
    const gate = read("components/companion-gate.tsx");
    expect(gate).toMatch(/const state = await buddyState\(profile\)/);
    expect(gate).toMatch(/scale=\{condition\(state\)\.scale\}/);
    expect(gate).toMatch(/fullness=\{fullness\(state\)\}/);
    expect(gate).toMatch(/bark=\{bark\(state\)\.text\}/);
  });

  it("only counts a session that has work in it", () => {
    // A workout row with no sets is a Start she walked away from, and
    // counting it would grow him for a button press.
    const views = read("lib/views.ts");
    const fn = views.slice(views.indexOf("export async function buddyState"));
    expect(fn).toMatch(/const worked = sessions\.filter\(\(w\) => w\.sets > 0\)/);
  });

  it("does not show an empty protein bar, because nothing logged is not zero", () => {
    const c = read("components/companion.tsx");
    expect(c).toMatch(/\{fullness !== null && \(/);
    // And the read model says so at the source.
    const views = read("lib/views.ts");
    const fn = views.slice(views.indexOf("export async function buddyState"));
    expect(fn).toMatch(/proteinG: food\.logged\.length === 0 \? null : food\.proteinG/);
  });

  it("offers Feed only when there is something to fix", () => {
    const c = read("components/companion.tsx");
    expect(c).toMatch(/const hungry = fullness !== null && fullness < 0\.7/);
    expect(c).toMatch(/\{hungry && \(/);
    expect(c).toMatch(/href="\/eat"/);
  });
});

suite("he never skips", () => {
  const near = (a: number, b: number, within = 0.6) => Math.abs(a - b) <= within;

  it("starts every activity from where the last one left him", () => {
    // The one that showed: laps returned the near end at elapsed 0 whatever
    // `x` was, so finishing a set at the far end and starting a lap made him
    // vanish from there and reappear at the other end of the strip.
    for (const activity of ["walk", "laps", "set", "idle", "wave", "sleep", "think"] as Activity[]) {
      for (const from of [8, 20, 50, 74, 92]) {
        const s = activityState(activity, 0.5, from);
        expect(travel(s, 0).x, `${activity} from ${from}`).toBeCloseTo(from, 5);
      }
    }
  });

  it("and moves continuously once he is going", () => {
    // No frame may jump further than a stride. Sampled finely enough that a
    // teleport of any size fails.
    for (const activity of ["walk", "laps"] as Activity[]) {
      for (const from of [8, 33, 61, 92]) {
        const s = activityState(activity, 0.5, from);
        let last = travel(s, 0).x;
        for (let t = 0; t <= s.duration + 8; t += 0.05) {
          const now = travel(s, t).x;
          expect(near(now, last, 2), `${activity} from ${from} at ${t.toFixed(2)}`).toBe(true);
          last = now;
        }
      }
    }
  });

  it("runs the full floor once he has arrived", () => {
    // The run-up must not become the whole lap: he still uses both ends.
    const s = activityState("laps", 0.5, 50);
    const xs = Array.from({ length: 400 }, (_, i) => travel(s, i * 0.05).x);
    expect(Math.min(...xs)).toBeLessThan(NEAR + 2);
    expect(Math.max(...xs)).toBeGreaterThan(FAR - 2);
  });
});
