import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { defineTool } from "./define";
import { LATEST_ID, unseen, WHATS_NEW } from "@/lib/whats-new";

/**
 * What changed, askable. "What's new?" is a sentence people say to an app,
 * and the note in the corner is the same list.
 */
export const listWhatsNew = defineTool({
  name: "list_whats_new",
  description:
    "Lists what has changed in the app recently that she has not been told about yet, newest first, with where to go and look. Use it when she asks what is new, what changed, or whether the app can do something it recently gained.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const [p] = await db.select({
      seen: profiles.whatsNewSeen, createdAt: profiles.createdAt, birth: profiles.postpartumBirthDate,
    }).from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!p) return { entries: [] };
    return {
      unseen: unseen(p.seen, { createdAt: p.createdAt, recovering: p.birth !== null, owner: false }),
      all: WHATS_NEW.slice(0, 8),
    };
  },
});

export const dismissWhatsNew = defineTool({
  name: "dismiss_whats_new",
  description:
    "Marks the what's-new note as read for her, so it stops appearing. Use it when she says she has seen it or asks to make it go away.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    await db.update(profiles).set({ whatsNewSeen: LATEST_ID }).where(eq(profiles.id, ctx.profileId));
    return { ok: true };
  },
});
