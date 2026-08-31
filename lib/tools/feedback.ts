import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import { defineTool } from "./define";

export const submitFeedback = defineTool({
  name: "submit_feedback",
  description:
    "Record something she wants changed about the app itself — a missing feature, a bug, or something confusing. Call this whenever she complains about the app rather than about training: 'I wish I could…', 'this keeps doing…', 'I can never find…'. Capture it in her own words, tell her it's been passed on, and move on. Do not turn it into a conversation about the app.",
  input: z.object({
    kind: z.enum(["idea", "bug", "confusing"]),
    body: z.string().describe("What she wants, in her words — quote her rather than paraphrasing into product-speak"),
    path: z.string().optional().describe("Filled in by the app when reported from a screen. Leave this out."),
  }),
  handler: async (input, ctx) => {
    const [row] = await db.insert(feedback).values({
      profileId: ctx.profileId,
      kind: input.kind,
      body: input.body,
      path: input.path ?? null, // null when it came through conversation
    }).returning();
    return { ok: true, id: row.id, kind: row.kind };
  },
});

export const listFeedback = defineTool({
  name: "list_feedback",
  description:
    "What she has asked for and where each request stands. Use it if she asks whether something she reported got fixed.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await db.select().from(feedback)
      .where(eq(feedback.profileId, ctx.profileId))
      .orderBy(desc(feedback.createdAt)).limit(25);
    return rows.map((r) => ({
      kind: r.kind,
      request: r.body,
      status: r.status,
      reply: r.reply,
      submitted: r.createdAt.toISOString().slice(0, 10),
    }));
  },
});
