import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { describeSet, loggedSummary } from "@/lib/holds";
import { BANDS, asksBand, bandShort } from "@/lib/bands";
import { sideAndBand } from "@/lib/views";
import { registry } from "@/lib/tools";
import { EXERCISES } from "@/lib/seed/exercises";

/*
  Two requests from Maria, filed the same day:

  "For exercises that need to be done on both sides, specify if the target
   number is per side or the total for both sides. Also keep track of which
   side was done last."

  "When doing an exercise with the resistance band, have a space to specify the
   strength of the resistance band, such as light, heavy, extra heavy"
*/

suite("a movement done one side at a time says so", () => {
  it("has the flag already, on the movements that need it", () => {
    // `unilateral` has been seeded for years and read by nothing, which is
    // why "3 × 10" on a side plank was ambiguous in the first place.
    const byName = new Map(EXERCISES.map((e) => [e.slug, e]));
    for (const slug of ["side-plank", "bulgarian-split-squat", "dumbbell-row", "bird-dog"]) {
      expect(byName.get(slug)?.unilateral, slug).toBe(true);
    }
    // …and not on the ones that are not: a banded lateral walk is both ways
    // and a squat has no sides, which is why this is a flag and not a regex
    // over the name.
    for (const slug of ["goblet-squat", "band-lateral-walk", "farmer-carry"]) {
      expect(byName.get(slug)?.unilateral ?? false, slug).toBe(false);
    }
  });

  it("says it on the card, open and folded", () => {
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/perSide && <span className="text-accent">per side<\/span>/);
    expect(card).toMatch(/exercise\.unilateral && <span className="text-accent"> per side<\/span>/);
  });
});

suite("which side was done last", () => {
  it("takes today's last answer over an older one", () => {
    // The set she did ten minutes ago beats the one she did on Tuesday.
    expect(sideAndBand([{ side: "left", band: null }], "right", null).lastSide).toBe("left");
    expect(sideAndBand([], "right", null).lastSide).toBe("right");
  });

  it("is not erased by sets logged without one", () => {
    // Doing left-then-right and calling it one set is normal, and those sets
    // carry no side — they must not hide the last one that did.
    const today = [{ side: "left" as const, band: null }, { side: null, band: null }];
    expect(sideAndBand(today, "right", null).lastSide).toBe("left");
  });

  it("says nothing rather than guessing", () => {
    // Guessing from nothing would start her on the left every time, whatever
    // she actually did.
    expect(sideAndBand([], null, null).lastSide).toBeNull();
    expect(sideAndBand([{ side: null, band: null }], null, null).lastSide).toBeNull();
  });

  it("opens the card on the side she did not do", () => {
    // The useful half of the request is the default, not the display: she
    // does not want to be told which side she did, she wants the app to start
    // her on the other one.
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/exercise\.lastSide === "left" \? "right" : "left"/);
  });
});

suite("which band", () => {
  it("is ordered, and short enough for a set square", () => {
    expect(BANDS.map((b) => b.value)).toEqual([
      "extra light", "light", "medium", "heavy", "extra heavy",
    ]);
    expect(bandShort("extra heavy")).toBe("XH");
    expect(bandShort("mauve")).toBeNull();
  });

  it("shows on a set where a weight would be, never both", () => {
    // A set done with a dumbbell *and* a band is not something this app
    // records, and showing both would imply it is.
    expect(describeSet({ reps: 10, weight: null, band: "heavy" }, false)).toBe("10·H");
    expect(describeSet({ reps: 10, weight: 20, band: "heavy" }, false)).toBe("10@20");
    expect(describeSet({ reps: 10, weight: null, side: "left" }, false)).toBe("10 L");
  });

  it("is not asked once there is a weight in the field", () => {
    /*
      Stephen: "if weight is not 0 i think the band option should be hidden".

      He is right, and the row above is the evidence: `describeSet` already
      shows the weight and drops the band, so every set logged with both
      recorded an answer the app would never display. Nine of the twenty-five
      movements the library marks banded name a dumbbell, a cable or a machine
      in the same equipment list — a hammer curl, a rear delt fly, a bicep
      curl. They are one or the other, never both at once, and the overlap is
      asserted below rather than taken on trust.
    */
    const alsoLoaded = EXERCISES.filter((e) => {
      const kit = e.equipment ?? [];
      return kit.includes("resistance band")
        && kit.some((q) => ["dumbbell", "barbell", "kettlebell", "cable", "machine"].includes(q));
    });
    expect(alsoLoaded.map((e) => e.slug)).toContain("hammer-curl");
    expect(alsoLoaded.length).toBeGreaterThanOrEqual(5);

    expect(asksBand({ banded: true, weight: null })).toBe(true);
    expect(asksBand({ banded: true, weight: 12 })).toBe(false);
    // Zero is not a weight — the same rule the set itself follows, so an
    // untouched field still gets the question.
    expect(asksBand({ banded: true, weight: 0 })).toBe(true);
    // And a movement that takes no band is never asked, weight or no weight.
    expect(asksBand({ banded: false, weight: null })).toBe(false);
    expect(asksBand({ banded: false, weight: 12 })).toBe(false);
  });

  it("does not send the band it stopped showing", () => {
    /*
      The picker opens on the band she used last, so hiding it alone would
      leave a movement she has switched to dumbbells for filing every set
      under "heavy" with nothing on screen saying so. A control she cannot see
      must never still be sending a value — so the log reads `bandForSet`,
      which is `null` whenever the question was not asked.
    */
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/const askBand = asksBand\(\{ banded: exercise\.banded, weight: loaded \? weight : null \}\)/);
    expect(card).toMatch(/const bandForSet = askBand \? band : null/);
    expect(card).toMatch(/\{askBand && \(/);
    // Both the optimistic square and the row that is actually saved.
    expect(card).toMatch(/band: bandForSet,/);
    expect(card).toMatch(/\{ side, band: bandForSet \}/);
    // …and nowhere does either of them reach the raw picker state.
    expect(card).not.toMatch(/\{ side, band \}/);
  });

  it("collapses a day of sided sets into what she thinks she did", () => {
    // Four sets each side is eight rows and she thinks of it as four.
    const s = (side: "left" | "right") => ({ reps: 10, weight: 20, side });
    expect(loggedSummary([s("left"), s("right"), s("left"), s("right")], "kg", false))
      .toBe("2×10 @ 20kg, both sides");
    // …but only when they actually came out even.
    expect(loggedSummary([s("left"), s("left"), s("right")], "kg", false))
      .toBe("3×10 @ 20kg");
  });
});

suite("both go through the registry, and neither is silently dropped", () => {
  it("log_set takes them", () => {
    const src = fs.readFileSync("lib/tools/training.ts", "utf8");
    const tool = src.slice(src.indexOf('name: "log_set"'), src.indexOf('name: "correct_set"'));
    expect(tool).toMatch(/side: z\.enum\(\["left", "right"\]\)/);
    expect(tool).toMatch(/band: z\.enum\(\["extra light", "light", "medium", "heavy", "extra heavy"\]\)/);
    expect(tool).toMatch(/side: input\.side \?\? null/);
    expect(tool).toMatch(/band: input\.band \?\? null/);
  });

  it("refuses a side on a movement with no sides", () => {
    /*
      Refused rather than dropped, the same as reps on a hold: discarding it
      would leave the coach believing it recorded something it did not, and
      the next question — "which side did I do last?" — answered from nothing.
    */
    const src = fs.readFileSync("lib/tools/training.ts", "utf8");
    expect(src).toMatch(/if \(input\.side && !ex\.unilateral\)/);
    expect(src).toMatch(/if \(input\.band && !\(ex\.equipment \?\? \[\]\)\.includes\("resistance band"\)\)/);
  });

  it("can be corrected, including back to nothing", () => {
    const src = fs.readFileSync("lib/tools/training.ts", "utf8");
    const tool = src.slice(src.indexOf('name: "correct_set"'));
    expect(tool).toMatch(/side: z\.enum\(\["left", "right"\]\)\.nullable\(\)/);
    expect(tool).toMatch(/input\.side === undefined \? \{\} : \{ side: input\.side \}/);
  });

  it("survives being logged offline", () => {
    // The gym basement is the normal case; a set queued with a side must
    // flush with it.
    const off = fs.readFileSync("lib/offline.ts", "utf8");
    expect(off).toMatch(/side\?: "left" \| "right";/);
    expect(off).toMatch(/\.\.\.\(extra\?\.side \? \{ side: extra\.side \} : \{\}\)/);
  });

  it("is the same registered tool the screen uses", () => {
    expect(registry.get("log_set")).toBeDefined();
    expect(registry.get("correct_set")).toBeDefined();
  });
});
