import type { MacroRow } from "@/lib/macro-progress";
import type { ISODate } from "@/lib/date";

/**
 * Water, tracked the way sleep and food are.
 *
 * It earns it for one reason above the rest: a shortfall of a couple of per
 * cent of body mass costs measurable strength and endurance, and reads from
 * the inside as a bad session rather than a dry one. The second reason is
 * quieter — thirst is routinely read as hunger, so somebody logging an honest
 * deficit and feeling terrible at four in the afternoon is often not hungry.
 * An app that talks about both of those and cannot see what she drank is
 * guessing.
 *
 * The house rule holds here and it matters more than usual: **unknown is not
 * zero.** Water is the easiest thing in this app to forget to log, and a day
 * with no rows is a day nobody wrote down — not a day she drank nothing.
 * Nothing here ever reports an unlogged day as a miss.
 */

/**
 * Two litres of *drinks*, as a default target.
 *
 * The number people quote — EFSA's 2.0 L for women, 2.5 L for men — is total
 * water *including food*, and food is reliably a fifth to a third of it. So
 * two litres drunk is, if anything, generous, which is the right direction for
 * a default nobody chose: it is a target she can move, not a prescription, and
 * `set_water_target` exists precisely because size, heat and training move it
 * more than any single figure can cover.
 */
export const WATER_TARGET_DEFAULT_ML = 2000;

/** Sensible bounds on a typed figure. Ten litres in a day is a medical event. */
export const WATER_MAX_ML = 10_000;
/** …and the smallest drink worth a row. A millilitre is a typo. */
export const WATER_MIN_ML = 10;

/**
 * The buttons, in millilitres.
 *
 * Real vessels rather than round numbers: nobody drinks 300ml, they drink a
 * glass. The imperial labels are the same objects, not conversions of the
 * metric labels — a US cup is 237ml and calling it "8 fl oz" is how people
 * actually say it.
 */
export const WATER_PRESETS = [
  { ml: 250, metric: "Glass", imperial: "Cup" },
  { ml: 500, metric: "Bottle", imperial: "Pint" },
  { ml: 750, metric: "Big bottle", imperial: "Large" },
] as const;

/** The buttons, named for her units. Picked on the server — see WaterCard. */
export function waterPresets(units: "metric" | "imperial"): { ml: number; label: string }[] {
  return WATER_PRESETS.map((p) => ({ ml: p.ml, label: units === "imperial" ? p.imperial : p.metric }));
}

/** A window is only worth averaging if this much of it was written down. */
export const WATER_LOGGED_SHARE = 0.5;
/** …and never on fewer days than this, however short the window. */
export const WATER_MIN_DAYS = 3;

const ML_PER_FL_OZ = 29.5735;

/** Her target, or the default. Millilitres, always. */
export function waterTarget(profile: { waterTargetMl?: number | null }): number {
  const set = profile.waterTargetMl;
  return set !== null && set !== undefined && set > 0 ? set : WATER_TARGET_DEFAULT_ML;
}

/**
 * "1.4 L" / "48 fl oz". Her units, and never more precision than she poured.
 *
 * Litres once past a litre, because "1750 ml" is a laboratory and "1.8 L" is
 * a day's drinking.
 */
export function formatWater(ml: number | null | undefined, units: "metric" | "imperial"): string {
  if (ml === null || ml === undefined) return "—";
  const whole = Math.max(0, Math.round(ml));
  if (units === "imperial") {
    const oz = Math.round(whole / ML_PER_FL_OZ);
    return `${oz} fl oz`;
  }
  if (whole < 1000) return `${whole} ml`;
  return `${(Math.round(whole / 100) / 10).toFixed(1).replace(/\.0$/, "")} L`;
}

/**
 * Read a typed or spoken amount. "500ml", "1.5l", "2 glasses", "16oz", "a pint".
 *
 * Null rather than a guess, the same refusal as a portion in a measure the
 * food is not sold in: a number the app invented for a drink she mistyped is
 * worse than asking again.
 */
export function parseWater(said: string): number | null {
  const t = said.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;

  const vessels: [RegExp, number][] = [
    [/^(?:a|1)?glass(?:es)?$/, 250],
    [/^(?:a|1)?cup(?:s)?$/, 237],
    [/^(?:a|1)?bottle(?:s)?$/, 500],
    [/^(?:a|1)?pint(?:s)?$/, 568],
  ];
  for (const [re, ml] of vessels) if (re.test(t)) return ml;

  // "2 glasses", "3 cups" — a count of a vessel.
  const counted = /^(\d+(?:\.\d+)?)(glass(?:es)?|cups?|bottles?|pints?)$/.exec(t);
  if (counted) {
    const each = counted[2].startsWith("glass") ? 250
      : counted[2].startsWith("cup") ? 237
        : counted[2].startsWith("bottle") ? 500 : 568;
    return clampWater(Math.round(Number(counted[1]) * each));
  }

  const litres = /^(\d+(?:\.\d+)?)(?:l|litres?|liters?)$/.exec(t);
  if (litres) return clampWater(Math.round(Number(litres[1]) * 1000));

  const mls = /^(\d+(?:\.\d+)?)(?:ml|millilitres?|milliliters?)$/.exec(t);
  if (mls) return clampWater(Math.round(Number(mls[1])));

  const oz = /^(\d+(?:\.\d+)?)(?:floz|oz|ounces?|fluidounces?)$/.exec(t);
  if (oz) return clampWater(Math.round(Number(oz[1]) * ML_PER_FL_OZ));

  /*
    A bare number is millilitres under a hundred-ish… no.

    It is ambiguous between millilitres, litres and ounces, and every reading
    is plausible for a real drink — "2" is two litres or two ounces and those
    are a hundredfold apart. Refusing is the only honest answer, and the same
    call `toGrams` makes for "1 glass rice".
  */
  return null;
}

function clampWater(ml: number): number | null {
  if (!Number.isFinite(ml) || ml < WATER_MIN_ML || ml > WATER_MAX_ML) return null;
  return Math.round(ml);
}

/** What the app says about a day, against her own target. */
export type WaterState = "none" | "low" | "close" | "there" | "unknown";

export function waterState(ml: number | null, target: number): WaterState {
  // Nothing written down is not nothing drunk. This is the whole rule.
  if (ml === null) return "unknown";
  if (ml === 0) return "none";
  if (ml >= target) return "there";
  return ml >= target * 0.7 ? "close" : "low";
}

export type WaterDay = { date: ISODate; ml: number | null };

export type WaterSummary = {
  /** Days in the window that have at least one row. */
  logged: number;
  /** Days the window covers. */
  days: number;
  /** Mean over *logged* days, or null when there are too few to mean anything. */
  meanMl: number | null;
  /** Logged days that reached the target. */
  daysOnTarget: number;
  /** How much to trust the mean. `under-logged` means do not judge at all. */
  confidence: "good" | "thin" | "under-logged";
};

/**
 * A window of days, judged on the logged ones only.
 *
 * Pure, so the refusal is testable: a fortnight with four days written down
 * says `under-logged` and nothing else, because the alternative — averaging
 * four days across fourteen — reports a number that reads as her drinking a
 * third of what she drank.
 */
export function summariseWater(days: WaterDay[], target: number): WaterSummary {
  const logged = days.filter((d) => d.ml !== null);
  const enough = logged.length >= WATER_MIN_DAYS
    && (days.length === 0 || logged.length / days.length >= WATER_LOGGED_SHARE);

  return {
    logged: logged.length,
    days: days.length,
    meanMl: enough ? Math.round(logged.reduce((n, d) => n + (d.ml ?? 0), 0) / logged.length) : null,
    daysOnTarget: logged.filter((d) => (d.ml ?? 0) >= target).length,
    confidence: !enough ? "under-logged" : logged.length >= days.length * 0.8 ? "good" : "thin",
  };
}

/**
 * One line for the volatile state block, or null.
 *
 * Null when today has nothing logged: the model believes that block completely,
 * and "she has drunk 0 ml" would have it telling her to drink when she may
 * have had two litres and not written any of it down.
 */
export function waterSignal(
  todayMl: number | null, target: number, units: "metric" | "imperial",
): string | null {
  if (todayMl === null) return null;
  return `Water today: ${formatWater(todayMl, units)} of a ${formatWater(target, units)} target`
    + `${todayMl >= target ? " — she is there" : ""}.`;
}

/**
 * Water as the sixth macro.
 *
 * It used to be its own card with its own meter, its own verdict sentence and
 * its own idea of what "close" meant — a second, worse version of the picture
 * the macro bars already draw five times. It is a number with a daily target,
 * which is exactly what those bars are for.
 *
 * The unit is the display unit, whole: millilitres, or fluid ounces. Not
 * litres, because every other row on that list is a plain integer against a
 * plain integer, and "1.5 L / 2 L" beside "124g / 130g" reads as a different
 * kind of fact.
 *
 * `complete` carries exactly the meaning it carries for calories: a day with
 * nothing written down is a floor, not a zero. It draws hatched and earns no
 * verdict, which is the whole rule.
 */
export function waterRow(
  ml: number | null, targetMl: number, units: "metric" | "imperial",
): MacroRow {
  const out = (v: number) => (units === "imperial" ? Math.round(v / ML_PER_FL_OZ) : Math.round(v));
  return {
    key: "water",
    label: "Water",
    value: out(ml ?? 0),
    target: out(targetMl),
    complete: ml !== null,
    suffix: units === "imperial" ? "oz" : "ml",
  };
}
