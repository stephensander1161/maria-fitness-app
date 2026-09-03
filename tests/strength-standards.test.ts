import { describe as suite, expect, it } from "vitest";
import { hasStandard, placeLift } from "@/lib/strength-standards";

suite("placing a lift against a standard", () => {
  it("names the rung she is on and the next one, with the gap", () => {
    // 70kg woman squatting 60kg: 0.86× bodyweight, past novice (0.75).
    const place = placeLift("barbell-back-squat", 60, 70)!;
    expect(place.tier).toBe("novice");
    expect(place.ratio).toBe(0.86);
    expect(place.next).toEqual({ tier: "intermediate", atKg: 87.5, gapKg: 27.5 });
  });

  it("calls the bottom 'starting out' rather than a failing grade", () => {
    const place = placeLift("barbell-back-squat", 30, 70)!;
    expect(place.tier).toBe("starting out");
    expect(place.next?.tier).toBe("novice");
  });

  it("stops rather than inventing a rung above the table", () => {
    const place = placeLift("barbell-back-squat", 140, 70)!;
    expect(place.tier).toBe("advanced");
    expect(place.next).toBeNull();
  });

  it("improves as she loses weight at the same lift", () => {
    // The honest, quietly encouraging property of a bodyweight multiple: on a
    // week when the bar has not moved, this has.
    const before = placeLift("barbell-back-squat", 60, 75)!;
    const after = placeLift("barbell-back-squat", 60, 70)!;
    expect(after.ratio).toBeGreaterThan(before.ratio);
    expect(after.next!.gapKg).toBeLessThan(before.next!.gapKg);
  });

  it("has nothing to say about a movement nobody publishes numbers for", () => {
    // A standard invented for an exercise is a made-up target dressed as a fact.
    expect(placeLift("dumbbell-lateral-raise", 10, 70)).toBeNull();
    expect(hasStandard("dumbbell-lateral-raise")).toBe(false);
    expect(hasStandard("barbell-deadlift")).toBe(true);
  });

  it("refuses nonsense input rather than returning a place", () => {
    expect(placeLift("barbell-back-squat", 60, 0)).toBeNull();
    expect(placeLift("barbell-back-squat", 0, 70)).toBeNull();
  });
});
