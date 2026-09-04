import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  avoidAt, checkOverdue, energyNote, impactReady, LACTATION_CALORIE_FLOOR, postpartumSignal,
  redFlags, stageFor, summarise, weeksSinceBirth, type PostpartumStatus,
} from "@/lib/postpartum";
import { nutritionTargets } from "@/lib/nutrition";
import { registry } from "@/lib/tools";

const read = (p: string) => fs.readFileSync(p, "utf8");
const TODAY = "2026-09-04";

const status = (over: Partial<PostpartumStatus> = {}): PostpartumStatus => ({
  birthDate: null, delivery: null, clearedAt: null, breastfeeding: false, symptoms: [], ...over,
});
/** n weeks before TODAY. */
const weeksAgo = (n: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 7 * 86_400_000).toISOString().slice(0, 10);

/**
 * This is the part of the app where being wrong costs years rather than a
 * week: loading a pelvic floor that is not ready, or crunching an abdominal
 * wall still remodelling, leaves people leaking or with a prolapse. Every rail
 * below is tested, and each was confirmed to fail when the rail is removed.
 */
suite("it stays out of the way of anyone it does not apply to", () => {
  it("has no stage and no opinions when she has not said she is postpartum", () => {
    const s = status();
    expect(stageFor(s, TODAY)).toBeNull();
    expect(postpartumSignal(s, TODAY)).toBe("");
    expect(summarise(s, TODAY)).toBe("");
    expect(impactReady(s, TODAY).ready).toBe(true);
  });
});

suite("clearance is a gate, not a formality", () => {
  it("keeps her in the early stage until a clinician has checked her", () => {
    // However long it has been. Time does not promote her; the check does,
    // because the check is what rules out what an app cannot see.
    for (const weeks of [1, 6, 12, 30, 80]) {
      expect(stageFor(status({ birthDate: weeksAgo(weeks) }), TODAY), `${weeks} weeks`).toBe("early");
    }
  });

  it("refuses to write a programme before clearance, in the block the model believes", () => {
    const sig = postpartumSignal(status({ birthDate: weeksAgo(3) }), TODAY);
    expect(sig).toMatch(/NOT been cleared/);
    expect(sig).toMatch(/Do not write or adjust a training programme/);
    // ...and does not apologise for what is left, which is real training.
    expect(sig).toMatch(/count as training/);
  });

  it("promotes her once cleared, and only then", () => {
    expect(stageFor(status({ birthDate: weeksAgo(8), clearedAt: weeksAgo(2) }), TODAY)).toBe("foundation");
    expect(stageFor(status({ birthDate: weeksAgo(20), clearedAt: weeksAgo(14) }), TODAY)).toBe("building");
  });

  it("notices when the check is overdue without nagging early", () => {
    expect(checkOverdue(status({ birthDate: weeksAgo(3) }), TODAY)).toBe(false);
    expect(checkOverdue(status({ birthDate: weeksAgo(8) }), TODAY)).toBe(true);
    // A caesarean is usually checked later, so the app waits longer.
    expect(checkOverdue(status({ birthDate: weeksAgo(7), delivery: "caesarean" }), TODAY)).toBe(false);
    expect(checkOverdue(status({ birthDate: weeksAgo(7), delivery: "vaginal" }), TODAY)).toBe(true);
    // And never once she has been cleared.
    expect(checkOverdue(status({ birthDate: weeksAgo(30), clearedAt: weeksAgo(20) }), TODAY)).toBe(false);
  });
});

suite("symptoms stop the progression", () => {
  it("treats leaking, heaviness, pain and bleeding as things to assess", () => {
    for (const sx of ["leaking", "heaviness", "pain", "bleeding"] as const) {
      expect(redFlags(status({ symptoms: [sx] })), sx).toContain(sx);
    }
  });

  it("never tells her to push through them", () => {
    const sig = postpartumSignal(
      status({ birthDate: weeksAgo(20), clearedAt: weeksAgo(14), symptoms: ["leaking"] }), TODAY);
    expect(sig).toMatch(/Never tell her to push through/);
    expect(sig).toMatch(/pelvic health physiotherapist/);
    // And says the hopeful, true thing in the same breath, because "go see
    // someone" on its own reads as a door closing.
    expect(sig).toMatch(/first-line treatment/);
    expect(sig).toMatch(/fixable/);
  });

  it("blocks impact while a symptom is present, however far along she is", () => {
    const s = status({ birthDate: weeksAgo(52), clearedAt: weeksAgo(44), symptoms: ["heaviness"] });
    const impact = impactReady(s, TODAY);
    expect(impact.ready).toBe(false);
    expect(impact.because).toMatch(/physiotherapist/);
  });
});

suite("impact needs clearance, time and no symptoms", () => {
  const cleared = (weeks: number) => status({ birthDate: weeksAgo(weeks), clearedAt: weeksAgo(1) });

  it("says no before clearance", () => {
    expect(impactReady(status({ birthDate: weeksAgo(20) }), TODAY).ready).toBe(false);
  });

  it("says no before about twelve weeks even when cleared", () => {
    expect(impactReady(cleared(8), TODAY).ready).toBe(false);
    expect(impactReady(cleared(11), TODAY).ready).toBe(false);
  });

  it("says yes when all three hold", () => {
    const ok = impactReady(cleared(14), TODAY);
    expect(ok.ready).toBe(true);
    expect(ok.because).toMatch(/gradually/);
  });
});

suite("what never gets prescribed", () => {
  it("rules out crunches and breath-holding at every stage", () => {
    for (const stage of ["early", "foundation", "building"] as const) {
      const listed = avoidAt(stage, status({ birthDate: weeksAgo(10) })).map((a) => a.what).join(" ");
      expect(listed, stage).toMatch(/crunch/i);
      expect(listed, stage).toMatch(/breath/i);
    }
  });

  it("rules out impact until she is building", () => {
    for (const stage of ["early", "foundation"] as const) {
      const listed = avoidAt(stage, status({ birthDate: weeksAgo(6) })).map((a) => a.what).join(" ");
      expect(listed, stage).toMatch(/Running/);
    }
  });

  it("says it to the coach too, not only to the screen", () => {
    const sig = postpartumSignal(status({ birthDate: weeksAgo(30), clearedAt: weeksAgo(20) }), TODAY);
    expect(sig).toMatch(/Never prescribe sit-ups, crunches or full planks/);
    expect(sig).toMatch(/never coach her to hold her breath/);
  });
});

suite("feeding is not a rounding error", () => {
  const her = {
    weightKg: 68, heightIn: 65, age: 32, sex: "female" as const,
    daysPerWeek: 3, units: "metric" as const, goalWeightKg: 62,
  };

  it("adds the cost of feeding to what she burns", () => {
    const feeding = nutritionTargets({ ...her, breastfeeding: true });
    const not = nutritionTargets({ ...her, breastfeeding: false });
    expect(feeding.maintenanceCalories).toBeGreaterThan(not.maintenanceCalories + 400);
  });

  it("never takes a feeding mother below the feeding floor", () => {
    // The ordinary floor is 1200. A deficit computed off a small body would
    // sail under that, and supply is what pays for it.
    const tiny = nutritionTargets({
      weightKg: 48, heightIn: 60, age: 39, sex: "female", daysPerWeek: 2,
      units: "metric", goalWeightKg: 44, breastfeeding: true,
    });
    expect(tiny.calorieTarget).toBeGreaterThanOrEqual(LACTATION_CALORIE_FLOOR);
  });

  it("tells her why, rather than silently moving the number", () => {
    expect(energyNote(status({ breastfeeding: false }))).toBeNull();
    const note = energyNote(status({ breastfeeding: true }))!;
    expect(note).toMatch(/450 kcal/);
    expect(note).toMatch(/supply/);
  });
});

suite("the app can reach it, and says where she is", () => {
  it("counts the weeks from the birth, not from the check", () => {
    expect(weeksSinceBirth(weeksAgo(9), TODAY)).toBe(9);
    expect(weeksSinceBirth(TODAY, TODAY)).toBe(0);
  });

  it("summarises her state in one sentence", () => {
    const s = status({ birthDate: weeksAgo(9), delivery: "caesarean", breastfeeding: true });
    const line = summarise(s, TODAY);
    expect(line).toMatch(/9 weeks postpartum/);
    expect(line).toMatch(/caesarean/);
    expect(line).toMatch(/NOT yet cleared/);
    expect(line).toMatch(/breastfeeding/);
  });

  it("ships its tools, so she can do all of it by asking", () => {
    expect(registry.has("set_postpartum_status")).toBe(true);
    expect(registry.has("get_postpartum_plan")).toBe(true);
  });

  it("points every stage at a movement the library actually has", () => {
    // A stage listing a slug that does not exist is a screen with dead links
    // and a coach prescribing something nobody can look up.
    const tools = read("lib/tools/postpartum.ts");
    const seed = read("lib/seed/exercises.ts");
    // Only the movements arrays, not the stage keys around them.
    const focus = tools.slice(tools.indexOf("const FOCUS"));
    const referenced = [...focus.matchAll(/movements: \[([\s\S]*?)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([a-z][a-z0-9-]+)"/g)].map((x) => x[1]));
    expect(referenced.length).toBeGreaterThan(8);
    const missing = [...new Set(referenced)].filter((sl) => !seed.includes(`slug: "${sl}"`));
    expect(missing, `these movements do not exist: ${missing.join(", ")}`).toEqual([]);
  });

  it("carries the non-negotiable sentence into the persona", () => {
    const persona = read("lib/agent/system.ts");
    expect(persona).toMatch(/Clearance is a gate/);
    expect(persona).toMatch(/pelvic health physiotherapist/);
    expect(persona).toMatch(/first-line treatment/);
  });
});
