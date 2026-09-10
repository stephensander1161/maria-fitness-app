import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { profiles, sleepLogs } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { getProfileById, todayForProfile } from "@/lib/profile";
import { addDays, FUTURE_DATE_ERROR, isFuture, weekStart } from "@/lib/date";
import {
  formatSleep, parseSleep, sleepBetween, sleepOn, sleepState, sleepTarget, SLEEP_MAX_MIN,
  SLEEP_SHORT_MIN, summariseSleep,
} from "@/lib/sleep";
import { defineTool } from "./define";

/**
 * Sleep, addressable by voice like everything else.
 *
 * A feature that only exists as a screen breaks this app's premise quietly:
 * she asks the coach, it says it can't, and she stops asking. "I slept badly"
 * is also the single most likely thing she says to a coach unprompted, so
 * this is the wrong feature to make her go and tap.
 *
 * The filing rule is the thing to get right and the thing a model will get
 * wrong: **a night belongs to the morning she woke up.** Said in every
 * description here, because the model is otherwise fifty-fifty on it and a
 * night filed one day early is a night missing from today and doubled
 * yesterday.
 */

const HOW_LONG =
  'How long she slept. Accepts "7h30", "7.5", "7:30" or a plain number of hours.';

/** Shared by the two tools that take a night: refuse rather than guess. */
async function nightDate(profileId: string, given?: string): Promise<{ date: string } | { error: string }> {
  const her = await todayForProfile(profileId);
  const date = given ?? her;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: `"${date}" is not a date. Use YYYY-MM-DD.` };
  if (isFuture(date, her)) return { error: FUTURE_DATE_ERROR };
  return { date };
}

export const logSleep = defineTool({
  name: "log_sleep",
  description:
    "Records a night's sleep, and how it went. A night is filed under the MORNING SHE WOKE UP: in bed at 1am and up at 9am today is today's sleep, not yesterday's. Say the date back to her so a mistake is obvious. Upserts, so logging the same night twice corrects it rather than doubling it.",
  input: z.object({
    howLong: z.string().describe(HOW_LONG),
    date: z.string().optional()
      .describe("YYYY-MM-DD, the morning she woke. Defaults to today. Use yesterday's date only if she is telling you about the night before last."),
    quality: z.number().int().min(1).max(5).optional()
      .describe("1 terrible to 5 excellent. Leave it out if she did not say — a missing rating is not a bad one."),
    bedAt: z.string().optional().describe('When she went to bed, local 24h clock, "HH:MM". Optional.'),
    wakeAt: z.string().optional().describe('When she got up, local 24h clock, "HH:MM". Optional.'),
    note: z.string().optional().describe("Anything she said about it — the baby, a late film, wine."),
  }),
  handler: async (input, ctx) => {
    const minutes = parseSleep(input.howLong);
    if (minutes === null) {
      return {
        ok: false,
        error: `Nothing was logged. "${input.howLong}" is not a length of sleep this app can read, or it is over ${formatSleep(SLEEP_MAX_MIN)}. Ask her how many hours and log that.`,
      };
    }
    const when = await nightDate(ctx.profileId, input.date);
    if ("error" in when) return { ok: false, error: when.error };

    const clock = (v: string | undefined) =>
      v === undefined ? null : (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim().padStart(5, "0") : null);

    const row = {
      profileId: ctx.profileId,
      date: when.date,
      minutes,
      quality: input.quality ?? null,
      bedAt: clock(input.bedAt),
      wakeAt: clock(input.wakeAt),
      note: input.note ?? null,
    };
    await db.insert(sleepLogs).values(row).onConflictDoUpdate({
      target: [sleepLogs.profileId, sleepLogs.date],
      set: {
        minutes: row.minutes, quality: row.quality,
        bedAt: row.bedAt, wakeAt: row.wakeAt, note: row.note,
      },
    });

    const profile = await getProfileById(ctx.profileId);
    const target = sleepTarget(profile ?? {});
    const state = sleepState(minutes, target);
    return {
      ok: true,
      date: when.date,
      slept: formatSleep(minutes),
      target: formatSleep(target),
      state,
      note: state === "short"
        // Information, not a telling-off. She knows she slept badly.
        ? `Under ${formatSleep(SLEEP_SHORT_MIN)}. Worth saying that a heavy session may feel harder today — do not tell her off for it.`
        : undefined,
    };
  },
});

export const getSleep = defineTool({
  name: "get_sleep",
  description:
    "Reads what she has slept — one night, or the last two weeks with the average and how many were short. Use before saying anything about her sleep, and before answering why a session felt hard. Nights she has not logged are absent, not zero.",
  input: z.object({
    date: z.string().optional().describe("YYYY-MM-DD for one night (the morning she woke). Leave out for the recent window."),
    days: z.number().int().min(1).max(90).optional().describe("How many nights back to summarise. Default 14."),
  }),
  handler: async (input, ctx) => {
    const her = await todayForProfile(ctx.profileId);
    const profile = await getProfileById(ctx.profileId);
    const target = sleepTarget(profile ?? {});

    if (input.date) {
      const night = await sleepOn(ctx.profileId, input.date);
      if (!night) return { ok: true, date: input.date, logged: false, note: "No sleep logged for that night. That means nobody wrote it down, not that she did not sleep." };
      return {
        ok: true, date: night.date, logged: true,
        slept: formatSleep(night.minutes), quality: night.quality,
        bedAt: night.bedAt, wakeAt: night.wakeAt, note: night.note,
        target: formatSleep(target), state: sleepState(night.minutes, target),
      };
    }

    const days = input.days ?? 14;
    const nights = await sleepBetween(ctx.profileId, addDays(her, -(days - 1)), her);
    const summary = summariseSleep(nights, target, days);
    return {
      ok: true,
      window: `${days} nights to ${her}`,
      target: formatSleep(target),
      loggedNights: summary.logged,
      average: summary.meanMinutes === null ? null : formatSleep(summary.meanMinutes),
      shortNights: summary.shortNights,
      averageQuality: summary.meanQuality,
      confidence: summary.confidence,
      nights: nights.map((n) => ({ date: n.date, slept: formatSleep(n.minutes), quality: n.quality })),
      note: summary.confidence === "under-logged"
        ? `Only ${summary.logged} of ${days} nights are logged. Do not average that or tell her how she has been sleeping — say there is not enough written down yet.`
        : undefined,
    };
  },
});

export const setSleepTarget = defineTool({
  name: "set_sleep_target",
  description:
    "Sets how long she is aiming to sleep, which is what every sleep figure in the app is measured against. Most adults land between 7 and 9 hours. Confirm the new figure back to her.",
  input: z.object({
    howLong: z.string().describe(HOW_LONG),
  }),
  handler: async (input, ctx) => {
    const minutes = parseSleep(input.howLong);
    if (minutes === null || minutes < 240 || minutes > 12 * 60) {
      return {
        ok: false,
        error: `Target unchanged. "${input.howLong}" is not a sleep target between 4 and 12 hours. Ask her for a number of hours.`,
      };
    }
    await db.update(profiles).set({ sleepTargetMinutes: minutes }).where(eq(profiles.id, ctx.profileId));
    return { ok: true, target: formatSleep(minutes) };
  },
});

export const removeSleep = defineTool({
  name: "remove_sleep",
  description:
    "Removes a logged night — she logged the wrong date, or guessed and wants it gone. Defaults to last night. Log sleep upserts by date, so this is the only way to make a night unknown again rather than merely different.",
  input: z.object({
    date: z.string().optional().describe("YYYY-MM-DD, the morning she woke. Defaults to today."),
  }),
  handler: async (input, ctx) => {
    const when = await nightDate(ctx.profileId, input.date);
    if ("error" in when) return { ok: false, error: when.error };
    const [row] = await db.delete(sleepLogs)
      .where(and(eq(sleepLogs.profileId, ctx.profileId), eq(sleepLogs.date, when.date)))
      .returning();
    if (!row) return { ok: false, error: `No sleep logged for ${when.date}.` };
    await audit("data.deleted", { detail: { profileId: ctx.profileId, scope: "sleep", date: when.date } });
    return { ok: true, date: when.date, note: "That night is unknown again, not zero." };
  },
});

export const sleepThisWeek = defineTool({
  name: "get_sleep_this_week",
  description:
    "This week's sleep against her target, Monday to today — the average, the short nights, and which nights are missing. Use when she asks how her week has been, or when explaining a flat session.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const her = await todayForProfile(ctx.profileId);
    const from = weekStart(her);
    const profile = await getProfileById(ctx.profileId);
    const target = sleepTarget(profile ?? {});
    const nights = await sleepBetween(ctx.profileId, from, her);
    const span = Math.max(1, Math.round((Date.parse(her) - Date.parse(from)) / 86_400_000) + 1);
    const summary = summariseSleep(nights, target, span);
    const have = new Set(nights.map((n) => n.date));
    const missing: string[] = [];
    for (let d = from; d <= her; d = addDays(d, 1)) if (!have.has(d)) missing.push(d);
    return {
      ok: true,
      weekStart: from,
      target: formatSleep(target),
      average: summary.meanMinutes === null ? null : formatSleep(summary.meanMinutes),
      loggedNights: summary.logged,
      nightsSoFar: span,
      shortNights: summary.shortNights,
      confidence: summary.confidence,
      missingNights: missing,
      sleepDebt: summary.debtMinutes > 0 ? formatSleep(summary.debtMinutes) : null,
    };
  },
});
