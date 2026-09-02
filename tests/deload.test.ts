import { describe as suite, expect, it } from "vitest";
import { movementStatus, readProgress } from "@/lib/deload";

const set = (reps: number, weightKg: number, rir: number | null = 2) => ({ reps, weightKg, rir });
const s = (date: string, sets: ReturnType<typeof set>[]) => ({ date, sets });

suite("noticing a stall", () => {
  it("does not call one bad session a stall", () => {
    const st = movementStatus("squat", "Squat", [
      s("2026-01-15", [set(7, 40), set(7, 40)]),
      s("2026-01-08", [set(10, 40), set(10, 40)]),
    ], 10);
    expect(st.stalled).toBe(false);
  });

  it("calls three sessions at the same weight short of target a stall", () => {
    const st = movementStatus("squat", "Squat", [
      s("2026-01-22", [set(8, 40)]),
      s("2026-01-15", [set(8, 40)]),
      s("2026-01-08", [set(7, 40)]),
    ], 10);
    expect(st.repeatedAtLoad).toBe(3);
    expect(st.stalled).toBe(true);
  });

  it("is not fooled by a week where she hit the target", () => {
    const st = movementStatus("squat", "Squat", [
      s("2026-01-22", [set(8, 40)]),
      s("2026-01-15", [set(10, 40)]),
      s("2026-01-08", [set(8, 40)]),
    ], 10);
    expect(st.repeatedAtLoad).toBe(1);
    expect(st.stalled).toBe(false);
  });

  it("spots the same weight costing more", () => {
    // Three left in the tank, then two, then one: she is working harder for
    // the same number.
    const st = movementStatus("squat", "Squat", [
      s("2026-01-22", [set(8, 40, 1)]),
      s("2026-01-15", [set(8, 40, 2)]),
      s("2026-01-08", [set(8, 40, 3)]),
    ], 10);
    expect(st.rirCreep).toBe(true);
  });

  it("says nothing at all about a movement with no history", () => {
    const st = movementStatus("squat", "Squat", [], 10);
    expect(st.stalled).toBe(false);
    expect(st.sessions).toBe(0);
  });
});

suite("what to say about it", () => {
  const stalledOne = movementStatus("squat", "Squat", [
    s("2026-01-22", [set(8, 40)]), s("2026-01-15", [set(8, 40)]), s("2026-01-08", [set(8, 40)]),
  ], 10);
  const stalledTwo = movementStatus("row", "Row", [
    s("2026-01-22", [set(8, 30)]), s("2026-01-15", [set(8, 30)]), s("2026-01-08", [set(8, 30)]),
  ], 10);

  it("names the deficit as the cause, because it usually is", () => {
    // The sentence that matters. A flat line with no explanation reads as her
    // having stopped trying, and that is the week people quit.
    const v = readProgress([stalledOne, stalledTwo], { inDeficit: true, weeksTraining: 8 });
    expect(v.explanation).toMatch(/deficit/);
    expect(v.explanation).toMatch(/win, not a plateau/);
    expect(v.suggestDeload).toBe(true);
  });

  it("does not propose a lighter week over a single lift", () => {
    const v = readProgress([stalledOne], { inDeficit: true, weeksTraining: 8 });
    expect(v.suggestDeload).toBe(false);
    expect(v.explanation).toMatch(/Keep the weight where it is/);
  });

  it("says nothing when everything is moving", () => {
    const moving = movementStatus("squat", "Squat", [
      s("2026-01-22", [set(10, 45)]), s("2026-01-15", [set(10, 40)]),
    ], 10);
    const v = readProgress([moving], { inDeficit: true, weeksTraining: 8 });
    expect(v.suggestDeload).toBe(false);
    expect(v.explanation).toMatch(/still moving/);
  });

  it("never uses the word plateau about her", () => {
    for (const inDeficit of [true, false]) {
      const v = readProgress([stalledOne, stalledTwo], { inDeficit, weeksTraining: 8 });
      expect(v.explanation).not.toMatch(/you have stalled|you've stalled|failing|behind/i);
    }
  });
});
