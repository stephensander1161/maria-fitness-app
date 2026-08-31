/**
 * Everything is stored canonically in metric (kg, cm). The UI converts on the
 * way in and out using the profile's `units` preference, so a unit switch never
 * requires a data migration.
 */
export type Units = "imperial" | "metric";

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const inToCm = (inches: number) => inches * CM_PER_IN;
export const cmToIn = (cm: number) => cm / CM_PER_IN;

/** Round to a sensible display precision (weights land on 0.1). */
const r1 = (n: number) => Math.round(n * 10) / 10;

export function weightOut(kg: number | null, units: Units): number | null {
  if (kg === null) return null;
  return r1(units === "imperial" ? kgToLb(kg) : kg);
}

export function weightIn(value: number, units: Units): number {
  return units === "imperial" ? lbToKg(value) : value;
}

export const weightLabel = (units: Units) => (units === "imperial" ? "lb" : "kg");

/** Height as a human string: 5'6" or 168 cm. */
export function heightLabel(cm: number | null, units: Units): string {
  if (cm === null) return "—";
  if (units === "metric") return `${Math.round(cm)} cm`;
  const totalIn = Math.round(cmToIn(cm));
  return `${Math.floor(totalIn / 12)}'${totalIn % 12}"`;
}

/* Body measurements: stored in centimetres, shown in inches for imperial. */

export function lengthOut(cm: number | null, units: Units): number | null {
  if (cm === null) return null;
  return r1(units === "imperial" ? cmToIn(cm) : cm);
}

export const lengthIn = (value: number, units: Units): number =>
  units === "imperial" ? inToCm(value) : value;

export const lengthLabel = (units: Units) => (units === "imperial" ? "in" : "cm");
