import { describe as suite, expect, it } from "vitest";
import { daysHiddenByNoise, DAILY_NOISE_KG, explainScaleMove } from "@/lib/weight-explainer";
import { MIN_PLAUSIBLE_DAY_KCAL } from "@/lib/energy-balance";

/**
 * The single most common way someone decides an app is not working: a good
 * day's deficit, and the scale up in the morning. It is a units problem —
 * tens of grams of fat against a thousand grams of water — and these check
 * that the explanation says so without ever claiming the fat loss happened.
 */
suite("explaining a reading that moved the wrong way", () => {
  const base = { daysApart: 1, complete: true };

  it("says nothing when the day was not fully logged", () => {
    // Meals typed in words carry no calorie figure. A deficit computed from a
    // partial day is invented, and this app's worst bug class is exactly that.
    expect(explainScaleMove({ ...base, changeKg: 0.05, balanceKcal: -500, complete: false })).toBeNull();
  });

  it("says nothing without a previous reading to compare", () => {
    expect(explainScaleMove({ ...base, changeKg: null, balanceKcal: -500 })).toBeNull();
    expect(explainScaleMove({ ...base, changeKg: 0.05, balanceKcal: null })).toBeNull();
  });

  it("puts a real deficit next to a real gain, and calls both true", () => {
    // 500 kcal is 65g of fat. A tenth of a pound is 45g. Neither is wrong.
    const out = explainScaleMove({ ...base, changeKg: 0.045, balanceKcal: -500 });
    expect(out).not.toBeNull();
    expect(Math.round(out!.fatKg * 1000)).toBe(65);
    expect(out!.withinNoise).toBe(true);
    expect(out!.note).toMatch(/65g of fat/);
    expect(out!.note).toMatch(/45g/);
    expect(out!.note).toMatch(/Both things are true/);
  });

  it("never claims she lost fat from one reading", () => {
    // The arithmetic is what a deficit is *worth*, not what the scale saw.
    for (const change of [-0.9, -0.2, 0, 0.2, 0.9]) {
      const out = explainScaleMove({ ...base, changeKg: change, balanceKcal: -500 });
      expect(out!.note, `change ${change}`).not.toMatch(/you lost|fat loss|well done|great/i);
    }
  });

  it("flags a move too big to be an ordinary day's water", () => {
    const out = explainScaleMove({ ...base, changeKg: 1.6, balanceKcal: -500 });
    expect(out!.withinNoise).toBe(false);
    expect(out!.note).toMatch(/more than a normal day/i);
  });

  it("states a surplus plainly, with no adjective attached", () => {
    const out = explainScaleMove({ ...base, changeKg: 0.3, balanceKcal: 400 });
    expect(out!.note).toMatch(/over what you burned/);
    expect(out!.note).not.toMatch(/too much|overate|slipped|bad/i);
  });

  it("counts how many days of deficit one reading can hide", () => {
    // 500 kcal a day is 65g of fat; a kilo of noise hides about a fortnight
    // of it. This is the number that makes daily weighing make sense.
    expect(daysHiddenByNoise(-500)).toBe(15);
    expect(daysHiddenByNoise(0)).toBeNull();
    expect(daysHiddenByNoise(300)).toBeNull();
    expect(DAILY_NOISE_KG).toBe(1);
  });
});

suite("a day nobody finished logging is not a deficit", () => {
  it("has a floor low enough to allow a real light day", () => {
    // Someone ill or deliberately fasting does eat this little. The floor is
    // there to catch "porridge and then nothing", not to police her.
    expect(MIN_PLAUSIBLE_DAY_KCAL).toBeGreaterThan(0);
    expect(MIN_PLAUSIBLE_DAY_KCAL).toBeLessThan(1200);
  });

  it("would refuse the case the real account produced", () => {
    // Probed against real data: a single day whose only entries all carried
    // figures, totalling ~170 kcal, which came out as a 1928 kcal deficit —
    // worth 250g of fat, next to a scale that had gone up 1.9kg. Explaining
    // that would have told her she was running a deficit she never ran.
    const underLogged = 170;
    expect(underLogged).toBeLessThan(MIN_PLAUSIBLE_DAY_KCAL);
    // And with the day rejected there is nothing to say, which is correct.
    expect(explainScaleMove({
      changeKg: 1.9, daysApart: 1, balanceKcal: null, complete: false,
    })).toBeNull();
  });
});
