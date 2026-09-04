import { randomInt } from "node:crypto";
import { and, desc, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { exercises, friendships, profiles, setLogs, workouts } from "@/lib/db/schema";
import { addDays, weekStart, type ISODate } from "@/lib/date";
import { profileToday } from "@/lib/profile";
import { streakWeeks, titleFor } from "@/lib/titles";
import { weightOut, weightLabel, type Units } from "@/lib/units";

/**
 * Friends, and the exact list of what one can see about another.
 *
 * The whole feature rests on one sentence: **a friend sees training, never a
 * body.** Sessions, streak, hard sets and best lifts are things she did.
 * Weight, measurements, photos, food, cycle, injuries and the coach
 * conversation are things about her, and none of them cross this boundary —
 * not summarised, not "just the trend", not once. A social feature is where
 * body data leaks first, so the shape of the returned object is the control:
 * there is no field here that could carry it.
 */

/** Exactly what leaves one profile for another. Nothing else is ever selected. */
export type FriendTraining = {
  name: string;
  /** Her rank, which only ever goes up — see lib/titles.ts. Never a body fact. */
  title: string;
  /** Sessions she finished this week, in *her* week, not the viewer's. */
  sessionsThisWeek: number;
  /** Hard sets logged this week. */
  setsThisWeek: number;
  /** Consecutive weeks with at least one session. */
  streakWeeks: number;
  /** Lifetime finished sessions. */
  sessionsAllTime: number;
  /**
   * Her heaviest sets this week, in the *viewer's* units — the viewer is the
   * one reading them, and a number in someone else's units is a number she has
   * to convert in her head or, worse, does not notice she is misreading.
   */
  bestLifts: { exercise: string; weight: number | null; reps: number; unit: string }[];
  /**
   * Never logged a session at all, as distinct from a quiet week. Zero
   * sessions in someone who trains is a rest week; zero in someone who has
   * never started is a different sentence, and the screen says which.
   */
  hasEverLogged: boolean;
};

export type FriendEdge = {
  friendshipId: string;
  friendProfileId: string;
  name: string;
  /** "friend" once accepted; otherwise who is waiting on whom. */
  state: "friend" | "they-asked" | "you-asked";
  since: string | null;
};

/* ── the code someone types to add her ─────────────────────────────────── */

/**
 * Crockford's alphabet: no I, L, O or U, so nothing in a code can be misread
 * as something else and no code can accidentally spell a word.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;

/** A fresh code. `randomInt` is rejection-sampled, so no character is likelier. */
export function generateShareCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * What she typed, turned into what is stored.
 *
 * Read out over a kitchen table a code arrives with spaces, dashes, lower
 * case, and the letters people substitute for digits. All of that is the same
 * code, and a feature that answers "no such code" to a correctly-read one is a
 * feature nobody uses twice.
 */
export function normaliseCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  // I and L are written for 1, O for 0 — Crockford's own substitutions.
  return cleaned.replace(/[IL]/g, "1").replace(/O/g, "0").slice(0, CODE_LENGTH);
}

/** Grouped for reading aloud: 4RJ2-K8QW. */
export const formatCode = (code: string): string =>
  code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

export const isWellFormedCode = (code: string): boolean =>
  code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));

/* ── what a row means to the person looking at it ──────────────────────── */

export type FriendshipRow = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted";
  respondedAt: Date | null;
};

/**
 * The one authorisation question, in one place: may this viewer see this
 * person's training?
 *
 * Accepted, and the viewer is one of the two. A pending request is not a yes —
 * asking must never be enough to see anything, or the request itself becomes
 * the leak.
 */
export function canSeeTraining(row: FriendshipRow | null, viewerProfileId: string): boolean {
  if (!row) return false;
  if (row.status !== "accepted") return false;
  return row.requesterId === viewerProfileId || row.addresseeId === viewerProfileId;
}

/** The other person in a pair, from the viewer's side. Null if it is not theirs. */
export function otherSide(row: FriendshipRow, viewerProfileId: string): string | null {
  if (row.requesterId === viewerProfileId) return row.addresseeId;
  if (row.addresseeId === viewerProfileId) return row.requesterId;
  return null;
}

export function edgeState(row: FriendshipRow, viewerProfileId: string): FriendEdge["state"] {
  if (row.status === "accepted") return "friend";
  return row.requesterId === viewerProfileId ? "you-asked" : "they-asked";
}

/* ── queries ───────────────────────────────────────────────────────────── */

/** Her code, minted on first use so an account that never shares never has one. */
export async function shareCodeFor(profileId: string): Promise<string> {
  const [row] = await db.select({ code: profiles.shareCode }).from(profiles)
    .where(eq(profiles.id, profileId)).limit(1);
  if (row?.code) return row.code;
  return mintShareCode(profileId);
}

/**
 * A new code, retried on the astronomically unlikely collision rather than
 * handed back as an error she cannot act on.
 */
export async function mintShareCode(profileId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShareCode();
    try {
      const [updated] = await db.update(profiles).set({ shareCode: code })
        .where(eq(profiles.id, profileId)).returning({ code: profiles.shareCode });
      if (updated?.code) return updated.code;
    } catch {
      // Unique violation: try another.
    }
  }
  throw new Error("Could not mint a share code");
}

/** Every friendship the viewer is part of, in either direction. */
export async function edgesFor(viewerProfileId: string): Promise<FriendEdge[]> {
  // Both ends of the pair are `profiles`, so the query needs two aliases of
  // the same table — Drizzle's alias(), not a hand-written SQL fragment.
  const requester = alias(profiles, "requester");
  const addressee = alias(profiles, "addressee");

  const rows = await db
    .select({
      id: friendships.id,
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      status: friendships.status,
      respondedAt: friendships.respondedAt,
      createdAt: friendships.createdAt,
      requesterName: requester.name,
      addresseeName: addressee.name,
    })
    .from(friendships)
    .innerJoin(requester, eq(requester.id, friendships.requesterId))
    .innerJoin(addressee, eq(addressee.id, friendships.addresseeId))
    .where(or(
      eq(friendships.requesterId, viewerProfileId),
      eq(friendships.addresseeId, viewerProfileId),
    ))
    .orderBy(desc(friendships.createdAt));

  return rows.map((r) => {
    const mine = r.requesterId === viewerProfileId;
    return {
      friendshipId: r.id,
      friendProfileId: mine ? r.addresseeId : r.requesterId,
      name: (mine ? r.addresseeName : r.requesterName) ?? "Someone",
      state: edgeState(r as FriendshipRow, viewerProfileId),
      since: r.respondedAt ? r.respondedAt.toISOString().slice(0, 10) : null,
    };
  });
}

/** One friendship, if the viewer is genuinely part of it. */
export async function edgeById(friendshipId: string, viewerProfileId: string) {
  const [row] = await db.select().from(friendships)
    .where(and(
      eq(friendships.id, friendshipId),
      or(eq(friendships.requesterId, viewerProfileId), eq(friendships.addresseeId, viewerProfileId)),
    ))
    .limit(1);
  return row ?? null;
}

/**
 * A friend's week.
 *
 * Two rules that are easy to get wrong and matter every time:
 *
 * 1. **Her week, her timezone.** Computed from the friend's own zone, not the
 *    viewer's. Judged against a viewer six hours west, a Sunday evening
 *    session falls outside the week she did it in.
 * 2. **The viewer's units.** The numbers are read by the viewer, so they are
 *    converted for the viewer — the same rule the tools already follow, only
 *    now the two people can disagree about pounds and kilos.
 */
export async function trainingFor(friendProfileId: string, viewerUnits: Units): Promise<FriendTraining> {
  const [friend] = await db
    .select({ name: profiles.name, timezone: profiles.timezone })
    .from(profiles).where(eq(profiles.id, friendProfileId)).limit(1);
  if (!friend) throw new Error("No such profile");

  const theirToday: ISODate = profileToday(friend);
  const week = weekStart(theirToday);
  const weekEnd = addDays(week, 6);
  const done = and(eq(workouts.profileId, friendProfileId), isNotNull(workouts.completedAt));

  const [[sessionsWeek], [setsWeek], [allTime], sessionDates, best] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(workouts)
      .where(and(done, gte(workouts.date, week), lte(workouts.date, weekEnd))),
    db.select({ n: sql<number>`count(*)::int` }).from(setLogs)
      .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
      .where(and(eq(workouts.profileId, friendProfileId), gte(workouts.date, week), lte(workouts.date, weekEnd))),
    db.select({ n: sql<number>`count(*)::int` }).from(workouts).where(done),
    db.select({ date: workouts.date }).from(workouts).where(done).orderBy(desc(workouts.date)).limit(400),
    db.select({ name: exercises.name, weightKg: setLogs.weightKg, reps: setLogs.reps })
      .from(setLogs)
      .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
      .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
      .where(and(
        eq(workouts.profileId, friendProfileId),
        gte(workouts.date, week), lte(workouts.date, weekEnd),
        isNotNull(setLogs.weightKg),
      ))
      .orderBy(desc(setLogs.weightKg))
      .limit(3),
  ]);

  const sessionsAllTime = allTime?.n ?? 0;
  return {
    name: friend.name ?? "Someone",
    title: titleFor({
      sets: setsWeek?.n ?? 0,
      sessions: sessionsAllTime,
      daysLogged: 0,
      streakWeeks: streakWeeks(sessionDates.map((r) => r.date as ISODate), (d) => weekStart(d), week),
      milestones: 0,
    }).name,
    sessionsThisWeek: sessionsWeek?.n ?? 0,
    setsThisWeek: setsWeek?.n ?? 0,
    streakWeeks: streakWeeks(sessionDates.map((r) => r.date as ISODate), (d) => weekStart(d), week),
    sessionsAllTime,
    bestLifts: best.map((b) => ({
      exercise: b.name,
      weight: weightOut(b.weightKg, viewerUnits),
      reps: b.reps,
      unit: weightLabel(viewerUnits),
    })),
    hasEverLogged: sessionsAllTime > 0,
  };
}
