/**
 * Food in her units.
 *
 * Body and food are two preferences, not one. Someone raised on a bathroom
 * scale in pounds may still cook from a kitchen scale in grams, and the other
 * way round is just as common — so `profiles.units` covers the body, and
 * `profiles.foodUnits` covers the kitchen, falling back to the body setting
 * when she has not said otherwise.
 *
 * Recipes and ingredient lines are stored as written — metric, since that is
 * what the templates are in — and converted here, at the boundary, in text.
 * Nothing about calories changes: a portion's grams are still what the maths
 * ran on, this only changes how the portion reads back to her.
 */
import type { Units } from "./units";

export const G_PER_OZ = 28.349523125;
export const G_PER_LB = 453.59237;
/** US customary — what North American recipes and measuring jugs use. */
export const ML_PER_FL_OZ = 29.5735295625;
export const ML_PER_CUP = 240;

/** Which units her food is shown in — set on its own, or following her body. */
export const foodUnitsOf = (p: { units: Units; foodUnits: Units | null }): Units =>
  p.foodUnits ?? p.units;

const trim = (n: number, places: number) => {
  const s = n.toFixed(places);
  return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};

/** Nearest quarter, written the way a recipe writes it: 1, 1¼, 2½. */
function quarters(n: number): string {
  const q = Math.round(n * 4) / 4;
  const whole = Math.floor(q);
  const frac = { 0: "", 0.25: "¼", 0.5: "½", 0.75: "¾" }[q - whole as 0 | 0.25 | 0.5 | 0.75] ?? "";
  if (whole === 0) return frac || "0";
  return `${whole}${frac}`;
}

/** A weight in grams, as she'd read it: "100 g" or "3.5 oz". */
export function gramsLabel(grams: number, units: Units): string {
  if (units === "metric") return grams >= 1000 ? `${trim(grams / 1000, 2)} kg` : `${Math.round(grams)} g`;
  const oz = grams / G_PER_OZ;
  if (oz >= 16) return `${trim(oz / 16, 1)} lb`;
  return `${trim(oz, oz < 10 ? 1 : 0)} oz`;
}

/** A volume in millilitres: "250 ml" or "1 cup" / "2 fl oz". */
export function millilitresLabel(ml: number, units: Units): string {
  if (units === "metric") return ml >= 1000 ? `${trim(ml / 1000, 2)} l` : `${Math.round(ml)} ml`;
  if (ml >= ML_PER_CUP) {
    const cups = quarters(ml / ML_PER_CUP);
    return `${cups} ${cups === "1" ? "cup" : "cups"}`;
  }
  return `${trim(ml / ML_PER_FL_OZ, 1)} fl oz`;
}

/** Oven temperatures land on the numbers ovens are marked in. */
export function temperatureLabel(celsius: number, units: Units): string {
  if (units === "metric") return `${Math.round(celsius / 5) * 5}°C`;
  return `${Math.round((celsius * 9 / 5 + 32) / 25) * 25}°F`;
}

const METRIC_MEASURE = /(\d+(?:[.,]\d+)?)\s?(kg|g|ml|l)\b/gi;
const CELSIUS = /(\d{2,3})\s?°?\s?C\b/g;

const IMPERIAL_MEASURE = /(\d+(?:[.,]\d+)?)\s?(fl\s?oz|oz|lbs?)\b/gi;
const FAHRENHEIT = /(\d{2,3})\s?°?\s?F\b/g;

const num = (s: string) => Number(s.replace(",", "."));

/**
 * One ingredient line or recipe step with its measures in her units.
 *
 * "250g chicken, Oven 200C" reads as "9 oz chicken, Oven 400°F" for an
 * imperial cook and is left alone for a metric one; "4oz salmon" goes the
 * other way. Counts and named measures — "2 eggs", "1 tbsp" — are never
 * touched, because they mean the same thing in either system.
 */
export function foodLine(text: string, units: Units): string {
  if (units === "imperial") {
    return text
      .replace(METRIC_MEASURE, (_, n: string, unit: string) => {
        const u = unit.toLowerCase();
        if (u === "g") return gramsLabel(num(n), units);
        if (u === "kg") return gramsLabel(num(n) * 1000, units);
        if (u === "ml") return millilitresLabel(num(n), units);
        return millilitresLabel(num(n) * 1000, units);
      })
      .replace(CELSIUS, (_, n: string) => temperatureLabel(Number(n), units));
  }
  return text
    .replace(IMPERIAL_MEASURE, (_, n: string, unit: string) => {
      const u = unit.toLowerCase().replace(/\s/g, "");
      if (u === "floz") return millilitresLabel(roundMl(num(n) * ML_PER_FL_OZ), units);
      if (u === "oz") return gramsLabel(roundGrams(num(n) * G_PER_OZ), units);
      return gramsLabel(roundGrams(num(n) * G_PER_LB), units);
    })
    .replace(FAHRENHEIT, (_, n: string) => temperatureLabel((Number(n) - 32) * 5 / 9, units));
}

/** Converted amounts land on kitchen-scale numbers — 115 g, not 113.4. */
const roundGrams = (g: number) => (g < 250 ? Math.round(g / 5) * 5 : Math.round(g / 10) * 10);
const roundMl = roundGrams;

export const foodLines = (lines: string[], units: Units): string[] =>
  lines.map((l) => foodLine(l, units));

/**
 * A shopping quantity — "250g" plus "cottage cheese" — in her units.
 * Named measures pass through unchanged, so a "handful" stays a handful.
 */
export function quantityLabel(amount: number, unit: string | null, units: Units): string {
  const u = unit?.toLowerCase() ?? null;
  const plain = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  if (u === null) return plain(amount);
  if (units === "imperial") {
    if (u === "g") return gramsLabel(amount, units);
    if (u === "kg") return gramsLabel(amount * 1000, units);
    if (u === "ml") return millilitresLabel(amount, units);
    if (u === "l") return millilitresLabel(amount * 1000, units);
  } else {
    if (u === "oz") return gramsLabel(roundGrams(amount * G_PER_OZ), units);
    if (u === "lb" || u === "lbs") return gramsLabel(roundGrams(amount * G_PER_LB), units);
  }
  // Tight units stay tight ("120g"); words get a space ("2 tbsp").
  return `${plain(amount)}${u.length <= 2 ? "" : " "}${u}`;
}
