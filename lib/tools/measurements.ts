import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { measurements, profiles } from "@/lib/db/schema";
import { FUTURE_DATE_ERROR, isFuture } from "@/lib/date";
import { lengthIn, lengthLabel } from "@/lib/units";
import { MEASURING_ADVICE, SITE_KEYS, SITES, siteHow, siteLabel } from "@/lib/measurements";
import { measurementProgress } from "@/lib/progress";
import { profileToday } from "@/lib/profile";
import { defineTool, type ToolContext } from "./define";

async function unitsOf(ctx: ToolContext) {
  const [p] = await db.select({ units: profiles.units }).from(profiles)
    .where(eq(profiles.id, ctx.profileId)).limit(1);
  return p?.units ?? "imperial";
}

/** Today in her timezone — never the server's. */
async function todayFor(ctx: ToolContext) {
  const [p] = await db.select({ timezone: profiles.timezone }).from(profiles)
    .where(eq(profiles.id, ctx.profileId)).limit(1);
  return profileToday(p ?? { timezone: null });
}

export const logMeasurement = defineTool({
  name: "log_measurement",
  description:
    "Record tape measurements. Pass every site she gives you in one call. Values are in her display units (inches by default). Re-logging the same site and date overwrites it. Returns the change since her first and previous measurement for each site — use those numbers in your reply.",
  input: z.object({
    measurements: z.array(z.object({
      site: z.enum(SITE_KEYS).describe("Which body site"),
      value: z.number().describe("Inches by default, centimetres if she uses metric"),
    })).describe("One entry per site measured"),
    date: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
    note: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const date = input.date ?? (await todayFor(ctx));
    if (isFuture(date)) return { ok: false, error: FUTURE_DATE_ERROR };

    for (const m of input.measurements) {
      const valueCm = lengthIn(m.value, units);
      await db.insert(measurements)
        .values({ profileId: ctx.profileId, date, site: m.site, valueCm, note: input.note ?? null })
        .onConflictDoUpdate({
          target: [measurements.profileId, measurements.date, measurements.site],
          set: { valueCm, note: input.note ?? null },
        });
    }

    const progress = await measurementProgress(ctx.profileId, units);
    const touched = new Set<string>(input.measurements.map((m) => m.site));

    return {
      ok: true,
      date,
      unit: lengthLabel(units),
      logged: progress.filter((p) => touched.has(p.site)).map((p) => ({
        site: p.label,
        current: p.current,
        changeSinceLast: p.changeSinceLast,
        changeTotal: p.changeTotal,
      })),
    };
  },
});

export const getMeasurements = defineTool({
  name: "get_measurements",
  description:
    "Her tape measurement history per site, with change since the first reading and since the previous one. Negative numbers mean inches lost. Check this before commenting on body-composition progress — especially when the scale has stalled, because the waist often keeps moving when weight does not.",
  input: z.object({
    site: z.enum(SITE_KEYS).optional().describe("Limit to one site; omit for all"),
  }),
  handler: async (input, ctx) => {
    const units = await unitsOf(ctx);
    const progress = await measurementProgress(ctx.profileId, units);
    const filtered = input.site ? progress.filter((p) => p.site === input.site) : progress;

    if (filtered.length === 0) {
      return {
        unit: lengthLabel(units),
        sites: [],
        hint: "Nothing measured yet. Waist is the one worth starting with — call get_measuring_guide for how to take it, then log_measurement once she has a number.",
      };
    }

    return {
      unit: lengthLabel(units),
      sites: filtered.map((p) => ({
        site: p.label,
        current: p.current,
        measuredOn: p.currentDate,
        changeSinceLast: p.changeSinceLast,
        changeTotal: p.changeTotal,
        firstMeasured: p.firstDate,
        readings: p.history.length,
        history: p.history.slice(0, 8),
      })),
    };
  },
});

export const getMeasuringGuide = defineTool({
  name: "get_measuring_guide",
  description:
    "How to take a measurement consistently — where to put the tape and when. Use this the first time she measures a site, or whenever her numbers look erratic, since inconsistent placement is almost always the cause.",
  input: z.object({
    site: z.enum(SITE_KEYS).optional().describe("Omit for all sites"),
  }),
  handler: async (input) => ({
    advice: MEASURING_ADVICE,
    sites: SITES
      .filter((s) => !input.site || s.key === input.site)
      .map((s) => ({ site: siteLabel(s.key), how: siteHow(s.key) })),
  }),
});
