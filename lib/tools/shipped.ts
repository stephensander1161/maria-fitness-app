import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import { defineTool } from "./define";

/**
 * Closing the loop on something she asked for.
 *
 * Shipping a request and never telling the person who made it is how people
 * stop making them. When a request is marked shipped with a reply, she sees a
 * small note about it, and answering the note is what marks it acknowledged —
 * including "not quite", which puts it straight back on the pile rather than
 * making her write it out a second time.
 */

export const listShippedForMe = defineTool({
  name: "list_shipped_for_me",
  description:
    "Lists things she asked for that have since shipped and that she has not been told about yet. Use it when she asks what is new, or what happened to something she suggested.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await db.select({
      id: feedback.id, request: feedback.body, reply: feedback.reply, at: feedback.resolvedAt,
    }).from(feedback)
      .where(and(
        eq(feedback.profileId, ctx.profileId),
        eq(feedback.status, "shipped"),
        isNull(feedback.acknowledgedAt),
      ))
      .orderBy(desc(feedback.resolvedAt))
      .limit(5);
    return { shipped: rows };
  },
});

export const acknowledgeShipped = defineTool({
  name: "acknowledge_shipped",
  description:
    "Records her answer to 'is this fixed?' about something she asked for. Say fixed true when she is happy with it, or false when it is still not right — false reopens the request so it comes back to be looked at again, and she does not have to write it out a second time.",
  input: z.object({
    id: z.string().describe("The request's id, from list_shipped_for_me"),
    fixed: z.boolean(),
    note: z.string().max(500).optional().describe("Anything she adds about what is still wrong"),
  }),
  handler: async (input, ctx) => {
    // Scoped in the query: a request id is a row id like any other, and
    // acknowledging someone else's is not a thing this can be used for.
    const [row] = await db.select().from(feedback)
      .where(and(eq(feedback.id, input.id), eq(feedback.profileId, ctx.profileId)))
      .limit(1);
    if (!row) return { ok: false, error: "No request of yours with that id." };

    if (input.fixed) {
      await db.update(feedback)
        .set({ acknowledgedAt: new Date() })
        .where(and(eq(feedback.id, row.id), eq(feedback.profileId, ctx.profileId)));
      return { ok: true, state: "confirmed" };
    }

    await db.update(feedback)
      .set({
        acknowledgedAt: new Date(),
        // Back on the pile, carrying what she said the second time.
        status: "new",
        resolvedAt: null,
        body: input.note ? `${row.body}\n\n[still not right] ${input.note}` : row.body,
        reply: null,
      })
      .where(and(eq(feedback.id, row.id), eq(feedback.profileId, ctx.profileId)));
    return { ok: true, state: "reopened" };
  },
});
