import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import { defineTool } from "./define";
import { audit } from "@/lib/audit";
import {
  canSeeTraining, edgeById, edgesFor, formatCode, isWellFormedCode, mintShareCode,
  normaliseCode, otherSide, shareCodeFor, trainingFor,
} from "@/lib/friends";

/**
 * Training shared with people she knows.
 *
 * Every tool here answers the same authorisation question through
 * canSeeTraining(): accepted, and the viewer is one of the two. Asking is
 * never enough — a pending request must reveal nothing, or the request is the
 * leak.
 *
 * What crosses is training and only training. See lib/friends.ts: the returned
 * shape has no field that could carry weight, a measurement, a photo, food, a
 * cycle note or an injury.
 */

const unitsFor = async (profileId: string) => {
  const [p] = await db.select({ units: profiles.units }).from(profiles)
    .where(eq(profiles.id, profileId)).limit(1);
  if (!p) throw new Error(`No profile ${profileId}`);
  return p.units;
};

export const getShareCode = defineTool({
  name: "get_share_code",
  description:
    "Gives her the short code someone else types to add her as a friend, so they can see each other's training. Read it out or text it — it is not her email address, and nobody can reach her without it. Use this whenever she wants to connect with someone.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const code = await shareCodeFor(ctx.profileId);
    return {
      code: formatCode(code),
      shareWith:
        "Anyone with this code can ask to see your training. They still need you to say yes.",
    };
  },
});

export const resetShareCode = defineTool({
  name: "reset_share_code",
  description:
    "Issues her a new friend code and retires the old one, so a code she has already given out stops working. Friends she has already accepted are unaffected — this only closes the door to anyone still holding the old code.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const code = await mintShareCode(ctx.profileId);
    await audit("friend.code_reset", { detail: { profileId: ctx.profileId } });
    return { ok: true, code: formatCode(code), note: "The old code no longer works." };
  },
});

export const addFriend = defineTool({
  name: "add_friend",
  description:
    "Sends a friend request using the code someone gave her, so the two of them can see each other's training once they agree. Takes the code as they read it out — spaces, dashes and lower case are all fine. If that person has already asked her, this joins them up straight away.",
  input: z.object({
    code: z.string().describe("The friend code they gave her, e.g. 4RJ2-K8QW"),
  }),
  handler: async (input, ctx) => {
    const code = normaliseCode(input.code);
    if (!isWellFormedCode(code)) {
      return { ok: false, error: "That doesn't look like a friend code. They're eight characters, like 4RJ2-K8QW." };
    }

    const [target] = await db.select({ id: profiles.id, name: profiles.name })
      .from(profiles).where(eq(profiles.shareCode, code)).limit(1);
    // One answer for "no such code" and for "that is your own", so the tool
    // cannot be used to sweep for codes that exist.
    if (!target || target.id === ctx.profileId) {
      return { ok: false, error: "No friend has that code. Check it with them and try again." };
    }

    // Either direction counts: if they asked her first, this is her yes.
    const [existing] = await db.select().from(friendships)
      .where(or(
        and(eq(friendships.requesterId, ctx.profileId), eq(friendships.addresseeId, target.id)),
        and(eq(friendships.requesterId, target.id), eq(friendships.addresseeId, ctx.profileId)),
      ))
      .limit(1);

    if (existing?.status === "accepted") {
      return { ok: true, state: "friend", name: target.name ?? "They", note: "You're already sharing training." };
    }
    if (existing && existing.requesterId === target.id) {
      await db.update(friendships)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(and(eq(friendships.id, existing.id), eq(friendships.addresseeId, ctx.profileId)));
      await audit("friend.accepted", { detail: { friendshipId: existing.id } });
      return { ok: true, state: "friend", name: target.name ?? "They", note: "They had already asked you, so you're connected." };
    }
    if (existing) {
      return { ok: true, state: "you-asked", name: target.name ?? "They", note: "You've already asked. Waiting on them." };
    }

    const [created] = await db.insert(friendships)
      .values({ requesterId: ctx.profileId, addresseeId: target.id })
      .returning({ id: friendships.id });
    await audit("friend.requested", { detail: { friendshipId: created.id } });
    return {
      ok: true, state: "you-asked", friendshipId: created.id, name: target.name ?? "They",
      note: "Asked. They see your training once they say yes.",
    };
  },
});

export const listFriends = defineTool({
  name: "list_friends",
  description:
    "Lists the people she shares training with, plus anyone waiting on an answer in either direction. Use it before reading a friend's stats, and whenever she asks who she is connected to.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const edges = await edgesFor(ctx.profileId);
    return {
      friends: edges.filter((e) => e.state === "friend"),
      waitingOnYou: edges.filter((e) => e.state === "they-asked"),
      waitingOnThem: edges.filter((e) => e.state === "you-asked"),
      shares: "Training only — sessions, streak, sets and best lifts. Never weight, measurements, photos or food.",
    };
  },
});

export const respondToFriendRequest = defineTool({
  name: "respond_to_friend_request",
  description:
    "Answers a friend request that is waiting on her: accept it and the two of them start sharing training, or decline and the request disappears. Declining keeps no record, so they can ask again later.",
  input: z.object({
    friendshipId: z.string().describe("From list_friends, under waitingOnYou"),
    accept: z.boolean(),
  }),
  handler: async (input, ctx) => {
    // Scoped in the query itself: only the person who was *asked* may answer,
    // so a requester cannot accept on the other's behalf.
    const [row] = await db.select().from(friendships)
      .where(and(
        eq(friendships.id, input.friendshipId),
        eq(friendships.addresseeId, ctx.profileId),
        eq(friendships.status, "pending"),
      ))
      .limit(1);
    if (!row) return { ok: false, error: "No friend request waiting on you with that id." };

    if (!input.accept) {
      await db.delete(friendships)
        .where(and(eq(friendships.id, row.id), eq(friendships.addresseeId, ctx.profileId)));
      await audit("friend.declined", { detail: { friendshipId: row.id } });
      return { ok: true, state: "declined" };
    }

    await db.update(friendships)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(and(eq(friendships.id, row.id), eq(friendships.addresseeId, ctx.profileId)));
    await audit("friend.accepted", { detail: { friendshipId: row.id } });
    return { ok: true, state: "friend" };
  },
});

export const removeFriend = defineTool({
  name: "remove_friend",
  description:
    "Stops sharing training with someone, in both directions at once, and cancels a request that has not been answered. She can add them again later with their code.",
  input: z.object({
    friendshipId: z.string().describe("From list_friends"),
  }),
  handler: async (input, ctx) => {
    const deleted = await db.delete(friendships)
      .where(and(
        eq(friendships.id, input.friendshipId),
        // Either side may end it, and nobody outside the pair can.
        or(eq(friendships.requesterId, ctx.profileId), eq(friendships.addresseeId, ctx.profileId)),
      ))
      .returning({ id: friendships.id });
    if (deleted.length === 0) return { ok: false, error: "You don't have a friend with that id." };
    await audit("friend.removed", { detail: { friendshipId: input.friendshipId } });
    return { ok: true };
  },
});

export const getFriendStats = defineTool({
  name: "get_friend_stats",
  description:
    "Reads how her friends are training — sessions this week, their streak, hard sets and their heaviest lifts, in her units. Call it with no arguments for everyone, or with one friendshipId for a single person. Use it when she asks how someone is getting on, or wants to compare weeks. It shows training only: no weight, measurements, photos or food, hers or theirs.",
  input: z.object({
    friendshipId: z.string().optional().describe("From list_friends; omit for all friends"),
  }),
  handler: async (input, ctx) => {
    const units = await unitsFor(ctx.profileId);

    if (input.friendshipId) {
      const row = await edgeById(input.friendshipId, ctx.profileId);
      // Asking is not seeing: a pending row fails canSeeTraining and is
      // refused exactly like a stranger's id.
      if (!canSeeTraining(row, ctx.profileId)) {
        return { ok: false, error: "You aren't sharing training with anyone by that id." };
      }
      const otherId = otherSide(row!, ctx.profileId)!;
      return { ok: true, friend: { friendshipId: row!.id, ...(await trainingFor(otherId, units)) } };
    }

    const friends = (await edgesFor(ctx.profileId)).filter((e) => e.state === "friend");
    if (friends.length === 0) {
      return {
        ok: true, friends: [],
        note: "No friends yet. get_share_code gives her a code to pass on, or add_friend takes someone else's.",
      };
    }
    return {
      ok: true,
      friends: await Promise.all(friends.map(async (f) => ({
        friendshipId: f.friendshipId,
        ...(await trainingFor(f.friendProfileId, units)),
      }))),
    };
  },
});
