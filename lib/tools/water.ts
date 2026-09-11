import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { profiles, waterLogs } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { getProfileById, todayForProfile } from "@/lib/profile";
import { FUTURE_DATE_ERROR, isFuture } from "@/lib/date";
import {
  formatWater, parseWater, summariseWater, waterState, waterTarget,
  WATER_MAX_ML, WATER_MIN_ML, waterTotals,
} from "@/lib/water";
import { defineTool } from "./define";

/**
 * Water, addressable by voice like everything else.
 *
 * This one has to be: water is the thing most often mentioned in passing —
 * "I've barely drunk anything today" — and least often worth opening an app
 * for. If the coach cannot take that sentence and write it down, the tracking
 * is a screen nobody visits.
 *
 * Everything is in *her* units at the boundary and millilitres underneath, and
 * nothing here ever reads an unlogged day as a dry one. See lib/water.ts.
 */

const AMOUNT =
  'How much, as she said it: "500ml", "1.5L", "16oz", "a pint", "2 glasses". '
  + "A bare number is refused, because two could be litres or ounces and those are a hundredfold apart.";

/** Her units for a drink: the food preference where she has one. */
async function unitsFor(profileId: string): Promise<"metric" | "imperial"> {
  const p = await getProfileById(profileId);
  return (p?.foodUnits ?? p?.units ?? "metric") as "metric" | "imperial";
}

export const logWater = defineTool({
  name: "log_water",
  description:
    "Writes down something she drank — a glass, a bottle, a pint, a number of millilitres or ounces. Use it the moment she mentions drinking, and for a catch-up like \"I've had about a litre today\". Adds to the day rather than replacing it, so several drinks are several calls. Returns the day's running total against her target.",
  repeatable: "several drinks in a day is the normal case, not a double-send",
  input: z.object({
    amount: z.string().describe(AMOUNT),
    label: z.string().optional().describe('What it was, if she said — "coffee", "squash". Optional.'),
    date: z.string().optional().describe("YYYY-MM-DD. Defaults to today."),
  }),
  handler: async (input, ctx) => {
    const ml = parseWater(input.amount);
    if (ml === null) {
      return {
        ok: false,
        error: `Nothing was logged. "${input.amount}" is not an amount this app can read, `
          + `or it is outside ${WATER_MIN_ML}ml–${WATER_MAX_ML}ml. Ask her how many millilitres, `
          + `ounces or glasses and log that.`,
      };
    }
    const her = await todayForProfile(ctx.profileId);
    const date = input.date ?? her;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: `"${date}" is not a date. Use YYYY-MM-DD.` };
    if (isFuture(date, her)) return { ok: false, error: FUTURE_DATE_ERROR };

    await db.insert(waterLogs).values({
      profileId: ctx.profileId, date, ml, label: input.label ?? null,
    });

    const profile = await getProfileById(ctx.profileId);
    const target = waterTarget(profile ?? {});
    const units = await unitsFor(ctx.profileId);
    const { today } = await waterTotals(ctx.profileId, date);

    return {
      ok: true,
      date,
      logged: formatWater(ml, units),
      dayTotal: formatWater(today, units),
      target: formatWater(target, units),
      state: waterState(today, target),
      // Read these back, not the millilitres: the figures above are already in
      // her units and the model does no unit arithmetic here.
      note: today !== null && today >= target ? "She is at her target for the day." : undefined,
    };
  },
});

export const getWater = defineTool({
  name: "get_water",
  description:
    "What she has drunk today and over the last week and month, against her target. Use it when she asks how she is doing on water, and before telling her to drink more — a day with nothing written down is a day nobody logged, not a dry one, and this says which.",
  input: z.object({
    date: z.string().optional().describe("YYYY-MM-DD. Defaults to today."),
  }),
  handler: async (input, ctx) => {
    const her = await todayForProfile(ctx.profileId);
    const date = input.date ?? her;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: `"${date}" is not a date. Use YYYY-MM-DD.` };

    const profile = await getProfileById(ctx.profileId);
    const target = waterTarget(profile ?? {});
    const units = await unitsFor(ctx.profileId);
    const totals = await waterTotals(ctx.profileId, date);
    const week = summariseWater(totals.week, target);
    const month = summariseWater(totals.month, target);

    const drinks = await db.select({
      id: waterLogs.id, ml: waterLogs.ml, label: waterLogs.label,
    }).from(waterLogs)
      .where(and(eq(waterLogs.profileId, ctx.profileId), eq(waterLogs.date, date)))
      .orderBy(desc(waterLogs.createdAt));

    return {
      date,
      target: formatWater(target, units),
      // Null, not zero. The difference is the whole point of this tool.
      today: totals.today === null ? null : formatWater(totals.today, units),
      anythingLoggedToday: totals.today !== null,
      state: waterState(totals.today, target),
      drinks: drinks.map((d) => ({ id: d.id, amount: formatWater(d.ml, units), label: d.label })),
      week: {
        daysLogged: week.logged, ofDays: week.days,
        average: week.meanMl === null ? null : formatWater(week.meanMl, units),
        daysAtTarget: week.daysOnTarget,
        confidence: week.confidence,
      },
      month: {
        daysLogged: month.logged, ofDays: month.days,
        average: month.meanMl === null ? null : formatWater(month.meanMl, units),
        daysAtTarget: month.daysOnTarget,
        confidence: month.confidence,
      },
      hint: week.confidence === "under-logged"
        ? "Too little of the week is written down to say anything about her drinking. Say that rather than drawing a conclusion."
        : undefined,
    };
  },
});

export const setWaterTarget = defineTool({
  name: "set_water_target",
  description:
    "Sets what she is aiming to drink in a day. Worth offering when she is training hard, somewhere hot, or feeding a baby — all of which move the figure more than any default can. Takes it as she says it: \"3 litres\", \"100oz\". Returns the new target in her units.",
  input: z.object({
    amount: z.string().describe(AMOUNT),
  }),
  handler: async (input, ctx) => {
    const ml = parseWater(input.amount);
    if (ml === null) {
      return { ok: false, error: `"${input.amount}" is not an amount this app can read. Ask her for litres or ounces.` };
    }
    await db.update(profiles).set({ waterTargetMl: ml }).where(eq(profiles.id, ctx.profileId));
    const units = await unitsFor(ctx.profileId);
    return { ok: true, target: formatWater(ml, units) };
  },
});

export const removeWaterLog = defineTool({
  name: "remove_water_log",
  description:
    "Takes a drink back off the day — a mistake, a double tap, or something she did not finish. Without an id it removes the most recent one for that day, which is what \"undo that\" means. Returns the day's total afterwards.",
  input: z.object({
    logId: z.string().optional().describe("From get_water. Omit for the most recent drink that day."),
    date: z.string().optional().describe("YYYY-MM-DD. Defaults to today."),
  }),
  handler: async (input, ctx) => {
    const her = await todayForProfile(ctx.profileId);
    const date = input.date ?? her;

    /*
      Scoped to her profile in the query itself, never checked afterwards —
      the rule for anything that destroys a row. An id from anywhere else
      matches nothing rather than deleting somebody's drink.
    */
    const [target] = input.logId
      ? await db.select({ id: waterLogs.id, ml: waterLogs.ml }).from(waterLogs)
        .where(and(eq(waterLogs.id, input.logId), eq(waterLogs.profileId, ctx.profileId))).limit(1)
      : await db.select({ id: waterLogs.id, ml: waterLogs.ml }).from(waterLogs)
        .where(and(eq(waterLogs.profileId, ctx.profileId), eq(waterLogs.date, date)))
        .orderBy(desc(waterLogs.createdAt)).limit(1);

    if (!target) return { ok: false, error: "Nothing to remove — there is no drink logged for that day." };

    await db.delete(waterLogs)
      .where(and(eq(waterLogs.id, target.id), eq(waterLogs.profileId, ctx.profileId)));
    await audit("data.deleted", { detail: { profileId: ctx.profileId, table: "water_logs", rows: 1 } });

    const profile = await getProfileById(ctx.profileId);
    const units = await unitsFor(ctx.profileId);
    const { today } = await waterTotals(ctx.profileId, date);
    return {
      ok: true,
      removed: formatWater(target.ml, units),
      date,
      dayTotal: today === null ? null : formatWater(today, units),
      target: formatWater(waterTarget(profile ?? {}), units),
    };
  },
});

/** Days in a range with their totals — for the screens' read models. */
export async function waterBetween(profileId: string, from: string, to: string) {
  return db.select({ date: waterLogs.date, ml: waterLogs.ml }).from(waterLogs)
    .where(and(
      eq(waterLogs.profileId, profileId),
      gte(waterLogs.date, from),
      lte(waterLogs.date, to),
    ));
}
