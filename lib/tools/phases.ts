import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { addDays } from "@/lib/date";
import { todayForProfile } from "@/lib/profile";
import { defineTool } from "./define";

/**
 * Two ways a plan bends rather than breaking.
 *
 * A fortnight at maintenance and a week in a hotel are both things that happen
 * to everyone, and an app with no concept of either turns them into a fortnight
 * of "over target" and four missed sessions. The data does not change; what
 * changes is whether the app calls it a plan or a failure.
 */

export const startMaintenancePhase = defineTool({
  name: "start_maintenance_phase",
  description:
    "Puts her on a planned break from the deficit, eating at maintenance for a week or two. Use it when she is worn down, before a holiday, or when a stall has more to do with how long she has been dieting than with what she is eating. Be honest about what it is for: the evidence has diet breaks roughly matching continuous dieting for fat loss, and their real value is that a planned fortnight at maintenance is a plan rather than falling off. Call set_nutrition_targets with the maintenance figure from run_check_in to actually change what she eats.",
  input: z.object({
    days: z.number().min(3).max(28).optional().describe("How long. Default 14."),
  }),
  handler: async (input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const until = addDays(today, input.days ?? 14);
    await db.update(profiles).set({ maintenanceUntil: until })
      .where(eq(profiles.id, ctx.profileId));
    return {
      ok: true, until, days: input.days ?? 14,
      hint: "Now call run_check_in for her maintenance figure and set_nutrition_targets to it. Tell her the scale will move up a little in the first few days and that it is food and water, not fat.",
    };
  },
});

export const endMaintenancePhase = defineTool({
  name: "end_maintenance_phase",
  description:
    "Ends the maintenance break and goes back to a deficit. Use it when the break is over or she wants to start again sooner. Set the target with set_nutrition_targets in the same turn, or she is left eating at maintenance with the app thinking otherwise.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const [row] = await db.update(profiles).set({ maintenanceUntil: null })
      .where(eq(profiles.id, ctx.profileId)).returning();
    return { ok: true, wasUntil: row?.maintenanceUntil ?? null };
  },
});

export const setEquipmentOverride = defineTool({
  name: "set_equipment_override",
  description:
    "Sets what she has to train with for a few days — a hotel gym with dumbbells to 20kg, a suitcase, nothing at all. Every movement the app suggests is filtered to it until the date passes, so a week away is a different plan rather than four sessions she 'missed'. Rebuild the week with create_weekly_plan afterwards, or swap the individual movements with suggest_substitutes.",
  input: z.object({
    equipment: z.array(z.string()).min(1)
      .describe("e.g. ['dumbbells'] or ['bodyweight only']"),
    days: z.number().min(1).max(60).optional().describe("How long. Default 7."),
    until: z.string().optional().describe("YYYY-MM-DD, if she gave a date"),
  }),
  handler: async (input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const until = input.until ?? addDays(today, input.days ?? 7);
    const [row] = await db.update(profiles)
      .set({ tempEquipment: input.equipment, tempEquipmentUntil: until })
      .where(eq(profiles.id, ctx.profileId))
      .returning();
    return {
      ok: true, equipment: input.equipment, until,
      normally: row?.equipment ?? [],
      hint: "Her usual equipment is remembered and comes back on its own. Build the week around this, and do not treat the lighter sessions as a step backwards.",
    };
  },
});

export const clearEquipmentOverride = defineTool({
  name: "clear_equipment_override",
  description:
    "Puts her usual equipment back before the override was due to expire — she is home early, or the gym reopened.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const [row] = await db.update(profiles)
      .set({ tempEquipment: null, tempEquipmentUntil: null })
      .where(eq(profiles.id, ctx.profileId)).returning();
    return { ok: true, equipment: row?.equipment ?? [] };
  },
});

/** What she can actually train with today, override included. */
export function equipmentToday(
  profile: { equipment: string[]; tempEquipment: string[] | null; tempEquipmentUntil: string | null },
  asOf: string,
): { equipment: string[]; overridden: boolean; until: string | null } {
  const active = profile.tempEquipment !== null
    && profile.tempEquipmentUntil !== null
    && profile.tempEquipmentUntil >= asOf;
  return {
    equipment: active ? profile.tempEquipment! : profile.equipment,
    overridden: active,
    until: active ? profile.tempEquipmentUntil : null,
  };
}

/** The line for the state block, when either phase is running. */
export function phaseSignal(
  profile: {
    equipment: string[]; tempEquipment: string[] | null; tempEquipmentUntil: string | null;
    maintenanceUntil: string | null;
  },
  asOf: string,
): string | null {
  const lines: string[] = [];
  const kit = equipmentToday(profile, asOf);
  if (kit.overridden) {
    lines.push(
      `She is away or without her usual kit until ${kit.until}: ${kit.equipment.join(", ")} only. `
      + `Suggest nothing she cannot do, and do not treat a lighter week as a step backwards.`,
    );
  }
  if (profile.maintenanceUntil !== null && profile.maintenanceUntil >= asOf) {
    lines.push(
      `She is on a planned maintenance break until ${profile.maintenanceUntil} — eating at maintenance `
      + `on purpose. The scale holding or rising slightly is the plan working, not a stall, and it is `
      + `food and water rather than fat. Do not suggest a deficit before then unless she asks.`,
    );
  }
  return lines.length ? lines.join(" ") : null;
}
