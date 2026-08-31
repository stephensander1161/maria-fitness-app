import { describe, expect, it } from "vitest";
import {
  CM_PER_IN,
  KG_PER_LB,
  cmToIn,
  heightLabel,
  inToCm,
  kgToLb,
  lbToKg,
  lengthIn,
  lengthLabel,
  lengthOut,
  type Units,
  weightIn,
  weightLabel,
  weightOut,
} from "@/lib/units";

const UNITS: Units[] = ["imperial", "metric"];

describe("conversion constants", () => {
  it("uses the exact international definitions", () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect(CM_PER_IN).toBe(2.54);
  });

  it("converts known anchor values", () => {
    expect(lbToKg(1)).toBe(0.45359237);
    expect(kgToLb(1)).toBeCloseTo(2.2046226218, 10);
    expect(inToCm(1)).toBe(2.54);
    expect(cmToIn(2.54)).toBe(1);
    expect(inToCm(12)).toBeCloseTo(30.48, 10);
    expect(lbToKg(220.462262)).toBeCloseTo(100, 6);
  });

  it("round-trips lb -> kg -> lb", () => {
    for (const lb of [0, 0.5, 1, 45, 135.5, 155, 225, 1000, 1e6]) {
      expect(kgToLb(lbToKg(lb))).toBeCloseTo(lb, 9);
    }
  });

  it("round-trips kg -> lb -> kg", () => {
    for (const kg of [0, 0.25, 2.5, 20, 42.5, 100, 453.59237]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 9);
    }
  });

  it("round-trips in <-> cm both ways", () => {
    for (const inches of [0, 1, 12, 27.5, 66, 72, 100.25]) {
      expect(cmToIn(inToCm(inches))).toBeCloseTo(inches, 9);
    }
    for (const cm of [0, 2.54, 30.48, 88.9, 167.64, 182.88]) {
      expect(inToCm(cmToIn(cm))).toBeCloseTo(cm, 9);
    }
  });

  it("treats negatives symmetrically (measurement deltas can be negative)", () => {
    expect(kgToLb(-1)).toBeCloseTo(-2.2046226218, 10);
    expect(cmToIn(-2.54)).toBe(-1);
  });
});

describe("weightOut", () => {
  const cases: [kg: number, units: Units, expected: number][] = [
    [100, "imperial", 220.5], // 220.462... -> 0.1
    [100, "metric", 100],
    [0, "imperial", 0],
    [0, "metric", 0],
    [68.0388555, "imperial", 150], // exactly 150 lb
    [0.25, "metric", 0.3], // half rounds up
    [0.24, "metric", 0.2],
    [70.55, "metric", 70.6],
    [70.44, "metric", 70.4],
    [1.0001, "metric", 1],
  ];

  for (const [kg, units, expected] of cases) {
    it(`${kg}kg in ${units} is ${expected}`, () => {
      expect(weightOut(kg, units)).toBe(expected);
    });
  }

  it("returns null for a missing weight in either system", () => {
    for (const units of UNITS) expect(weightOut(null, units)).toBeNull();
  });

  it("always lands on at most one decimal place", () => {
    for (const kg of [1 / 3, 2 / 3, 99.99999, 123.456789]) {
      for (const units of UNITS) {
        const out = weightOut(kg, units)!;
        expect(Math.abs(out * 10 - Math.round(out * 10))).toBeLessThan(1e-9);
      }
    }
  });
});

describe("weightIn", () => {
  it("converts pounds to kilograms for imperial and passes metric through", () => {
    expect(weightIn(220, "imperial")).toBeCloseTo(99.7903214, 7);
    expect(weightIn(100, "metric")).toBe(100);
    expect(weightIn(0, "imperial")).toBe(0);
  });

  it("is the inverse of weightOut to display precision", () => {
    for (const units of UNITS) {
      for (const shown of [0, 45, 132.5, 150, 220.5]) {
        expect(weightOut(weightIn(shown, units), units)).toBe(shown);
      }
    }
  });

  it("survives a storage round trip: display -> kg -> display", () => {
    const kg = weightIn(155.5, "imperial");
    expect(weightOut(kg, "imperial")).toBe(155.5);
    expect(weightOut(kg, "metric")).toBe(70.5); // the same mass, shown in kg
  });
});

describe("lengthOut / lengthIn", () => {
  const cases: [cm: number, units: Units, expected: number][] = [
    [2.54, "imperial", 1],
    [88.9, "imperial", 35],
    [86.36, "imperial", 34],
    [85.09, "metric", 85.1],
    [100, "metric", 100],
    [0, "imperial", 0],
    [76.2, "imperial", 30],
  ];

  for (const [cm, units, expected] of cases) {
    it(`${cm}cm in ${units} is ${expected}`, () => {
      expect(lengthOut(cm, units)).toBe(expected);
    });
  }

  it("returns null for a missing length in either system", () => {
    for (const units of UNITS) expect(lengthOut(null, units)).toBeNull();
  });

  it("converts inches to centimetres on the way in and passes metric through", () => {
    expect(lengthIn(34, "imperial")).toBeCloseTo(86.36, 10);
    expect(lengthIn(86.36, "metric")).toBe(86.36);
  });

  it("is the inverse of lengthOut to display precision", () => {
    for (const units of UNITS) {
      for (const shown of [0, 12.5, 34, 41.2, 100]) {
        expect(lengthOut(lengthIn(shown, units), units)).toBe(shown);
      }
    }
  });
});

describe("heightLabel", () => {
  const cases: [cm: number | null, units: Units, expected: string][] = [
    [null, "imperial", "—"],
    [null, "metric", "—"],
    [182.88, "imperial", `6'0"`], // exactly 72 in — the classic off-by-one
    [167.64, "imperial", `5'6"`], // exactly 66 in
    [170, "imperial", `5'7"`], // 66.93 rounds up to 67
    [181.5, "imperial", `5'11"`], // 71.46 rounds down to 71
    [182.2, "imperial", `6'0"`], // 71.73 rounds up into the next foot
    [152.4, "imperial", `5'0"`],
    [30.48, "imperial", `1'0"`],
    [0, "imperial", `0'0"`],
    [167.64, "metric", "168 cm"],
    [167.4, "metric", "167 cm"],
    [170, "metric", "170 cm"],
    [0, "metric", "0 cm"],
  ];

  for (const [cm, units, expected] of cases) {
    it(`${cm} cm in ${units} is ${expected}`, () => {
      expect(heightLabel(cm, units)).toBe(expected);
    });
  }

  it("never renders 12 inches instead of the next foot", () => {
    for (let cm = 120; cm <= 210; cm += 0.1) {
      const label = heightLabel(cm, "imperial");
      const inches = Number(label.split("'")[1].replace('"', ""));
      expect(inches).toBeGreaterThanOrEqual(0);
      expect(inches).toBeLessThan(12);
    }
  });

  it("is monotonic — a taller person never reads as shorter", () => {
    const toInches = (label: string) => {
      const [ft, rest] = label.split("'");
      return Number(ft) * 12 + Number(rest.replace('"', ""));
    };
    let last = -1;
    for (let cm = 120; cm <= 210; cm += 0.5) {
      const inches = toInches(heightLabel(cm, "imperial"));
      expect(inches).toBeGreaterThanOrEqual(last);
      last = inches;
    }
  });
});

describe("labels", () => {
  it("names the unit for each system", () => {
    expect(weightLabel("imperial")).toBe("lb");
    expect(weightLabel("metric")).toBe("kg");
    expect(lengthLabel("imperial")).toBe("in");
    expect(lengthLabel("metric")).toBe("cm");
  });
});
