import { describe as suite, expect, it } from "vitest";
import { dayEyebrow } from "@/lib/day-label";

suite("the day's eyebrow never repeats its name", () => {
  it("drops a prefix the title already says", () => {
    // A day nobody has renamed is titled after its weekday. "WEDNESDAY ·
    // Wednesday" is the same word twice, and on a phone the second copy is
    // the one that truncates to "Wednesd…".
    expect(dayEyebrow("Wednesday", "Wednesday")).toBe("");
    expect(dayEyebrow("wednesday", "Wednesday")).toBe("");
  });

  it("drops it when the title only adds a word to it", () => {
    // The placeholder a day gets when something is added to an empty one is
    // "Wednesday session", so matching the whole string was not enough.
    expect(dayEyebrow("Wednesday", "Wednesday session")).toBe("");
    expect(dayEyebrow("Today \u00b7 Wednesday", "Wednesday session")).toBe("Today");
  });

  it("does not swallow a different word that starts the same way", () => {
    expect(dayEyebrow("Mon", "Monday session")).toBe("Mon");
    expect(dayEyebrow("Sun", "Sunday")).toBe("Sun");
  });

  it("keeps the parts that say something new", () => {
    expect(dayEyebrow("Tuesday", "Shoulders")).toBe("Tuesday");
    expect(dayEyebrow("Today · Wednesday", "Wednesday")).toBe("Today");
    expect(dayEyebrow("Today · Tuesday", "Shoulders")).toBe("Today · Tuesday");
  });

  it("is empty rather than stray punctuation when there is no prefix", () => {
    // The caller renders "{eyebrow} ·", so a blank that is not falsy leaves a
    // dot floating in front of the heading.
    expect(dayEyebrow(undefined, "Shoulders")).toBe("");
    expect(dayEyebrow("", "Shoulders")).toBe("");
    expect(dayEyebrow(" · ", "Shoulders")).toBe("");
  });
});
