import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { asGiven, asNulls, fromLog, NO_MACROS } from "@/components/today-food";

suite("a meal typed by hand can carry every macro", () => {
  it("takes all five, not just calories and protein", () => {
    /*
      The manual form asked for calories and protein only, which made it the
      one place in the app that could not record a whole meal: the coach has
      logged carbs and fat for a while, the day totals them, the bars draw
      them — so anything typed in by hand arrived permanently incomplete and
      turned the day into a floor on every macro it left out.
    */
    expect(Object.keys(NO_MACROS).sort()).toEqual(["calories", "carbs", "fat", "fibre", "protein"]);
    expect(asGiven({ calories: "420", protein: "18", carbs: "62", fat: "11", fibre: "9" }))
      .toEqual({ calories: 420, proteinG: 18, carbsG: 62, fatG: 11, fibreG: 9 });
  });

  it("leaves a blank out entirely when logging", () => {
    // Unknown is not zero. A macro she did not fill in must not be sent as 0,
    // or the day counts it as nothing eaten instead of as a floor.
    expect(asGiven({ ...NO_MACROS, calories: "420" })).toEqual({ calories: 420 });
    expect(asGiven(NO_MACROS)).toEqual({});
  });

  it("sends a blank as an explicit null when correcting", () => {
    // Clearing a figure she had already put in has to be able to make it
    // unknown again, which leaving the field out could not say.
    expect(asNulls({ ...NO_MACROS, calories: "420" })).toEqual({
      calories: 420, proteinG: null, carbsG: null, fatG: null, fibreG: null,
    });
  });

  it("refuses nonsense rather than logging NaN", () => {
    for (const junk of ["abc", " ", "--", ""]) {
      expect(asGiven({ ...NO_MACROS, calories: junk }), junk).toEqual({});
    }
  });

  it("round-trips an entry into the edit form", () => {
    const log = { calories: 420, proteinG: 18, carbsG: null, fatG: 11, fibreG: null };
    expect(fromLog(log)).toEqual({ calories: "420", protein: "18", carbs: "", fat: "11", fibre: "" });
    // An unknown comes back blank, not as "0" — and goes back as null.
    expect(asNulls(fromLog(log)).carbsG).toBeNull();
  });
});

suite("the estimate button fills what it can", () => {
  const src = fs.readFileSync("components/today-food.tsx", "utf8");

  it("asks the library for every macro, not two of them", () => {
    expect(src).toMatch(/proteinG\?: number; carbsG\?: number; fatG\?: number; fibreG\?: number/);
    expect(src).toMatch(/\["fat", num\(r\.fatG\)\]/);
  });

  it("scales each one to her portion by calories", () => {
    // Grams per calorie is a property of the food — the same arithmetic that
    // was called proteinForCalories, which was never protein-specific.
    expect(src).toMatch(/gramsForCalories\(ref, refKcal \?\? 0, Number\(calories\)\)/);
  });

  it("only fills the boxes she left empty", () => {
    expect(src).toMatch(/if \(!blanks\.includes\(key\)/);
  });
});
