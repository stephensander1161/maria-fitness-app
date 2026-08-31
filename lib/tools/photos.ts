import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { today } from "@/lib/date";
import { defineTool } from "./define";

/**
 * Progress photos.
 *
 * The hard rule in this file: **no handler ever returns base64 image data.**
 * A single 100KB photo is ~135,000 base64 characters — tens of thousands of
 * tokens, resent on every subsequent turn of the conversation. One accidental
 * photo in the context window would cost more than a month of normal use and
 * would blow past the daily ceiling in lib/limits.ts. Tools return metadata;
 * the pixels only ever travel from the browser to Postgres and back to the
 * Progress screen (lib/photos.ts is the read model for that).
 */

/**
 * The UI resizes to 800px on the long edge at ~0.75 JPEG quality, which lands
 * around 60–120KB. This ceiling is the backstop for anything that slips
 * through — a panorama, a screenshot of a screenshot — rather than the target.
 * Base64 is 4 chars per 3 bytes, so ~300KB of JPEG is ~400,000 characters.
 */
const MAX_BASE64_CHARS = 400_000;
const MAX_KB = Math.round((MAX_BASE64_CHARS * 3) / 4 / 1024);

/** Only JPEG: it is what the canvas re-encode produces, and insisting on it is
 *  what guarantees the EXIF (including GPS) from the original phone photo is
 *  gone — a re-encode cannot carry metadata it never parsed. */
const JPEG_DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;

const POSES = ["front", "side", "back"] as const;

export const addProgressPhoto = defineTool({
  name: "add_progress_photo",
  uiOnly: true,
  description:
    "Store a progress photo she has just taken. The app calls this from the camera button on the Progress screen — you have no way to produce image data yourself, so you will essentially never call it. If she asks how to add one, tell her: Progress screen, Photos, Add. Never invent an `image` value.",
  input: z.object({
    image: z.string().describe(
      "A `data:image/jpeg;base64,…` URL, already resized by the browser. Supplied by the app, never by you.",
    ),
    width: z.number().int().positive().describe("Pixel width after resizing"),
    height: z.number().int().positive().describe("Pixel height after resizing"),
    date: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
    pose: z.enum(POSES).optional().describe("Which angle — front, side or back"),
  }),
  handler: async (input, ctx) => {
    const match = JPEG_DATA_URL.exec(input.image.trim());
    if (!match) {
      return { ok: false, error: "Photos must be a data:image/jpeg;base64 URL produced by the app." };
    }
    const data = match[1];

    if (data.length > MAX_BASE64_CHARS) {
      return {
        ok: false,
        error: `That photo is about ${Math.round((data.length * 3) / 4 / 1024)}KB after resizing, over the ${MAX_KB}KB limit. Take it again with a smaller image.`,
      };
    }

    const [row] = await db.insert(photos).values({
      profileId: ctx.profileId,
      date: input.date ?? today(),
      pose: input.pose ?? null,
      data,
      width: input.width,
      height: input.height,
    }).returning({ id: photos.id, date: photos.date, pose: photos.pose });

    // Metadata only on the way back out — deliberately not the image.
    return { ok: true, id: row.id, date: row.date, pose: row.pose, storedKb: Math.round((data.length * 3) / 4 / 1024) };
  },
});

export const listProgressPhotos = defineTool({
  name: "list_progress_photos",
  description:
    "Which progress photos she has and when they were taken — id, date and angle only. This never returns the images and you cannot see them: they are hundreds of kilobytes each and would flood the conversation. Use it to know whether she has a photo history, how long it spans, and whether she is due one; then talk about it (\"your first front photo was in March\") or point her at the side-by-side comparison on the Progress screen.",
  input: z.object({
    pose: z.enum(POSES).optional().describe("Limit to one angle"),
  }),
  handler: async (input, ctx) => {
    // Note the explicit column list: selecting `photos.data` here would put
    // base64 into a tool result and straight into the model's context.
    const rows = await db.select({
      id: photos.id,
      date: photos.date,
      pose: photos.pose,
    }).from(photos)
      .where(input.pose
        ? and(eq(photos.profileId, ctx.profileId), eq(photos.pose, input.pose))
        : eq(photos.profileId, ctx.profileId))
      .orderBy(desc(photos.date))
      .limit(200);

    if (rows.length === 0) {
      return {
        photos: [],
        hint: "No photos yet. Photos catch what the scale misses during recomposition — suggest one a month, same spot, same light, same time of day.",
      };
    }

    return {
      count: rows.length,
      first: rows[rows.length - 1].date,
      latest: rows[0].date,
      photos: rows,
    };
  },
});

export const deleteProgressPhoto = defineTool({
  name: "delete_progress_photo",
  uiOnly: true,
  description:
    "Delete one progress photo by id, from list_progress_photos. Only when she asks — deletion is permanent and there is no other copy.",
  input: z.object({ photoId: z.string().describe("id from list_progress_photos") }),
  handler: async (input, ctx) => {
    const [row] = await db.delete(photos)
      .where(and(eq(photos.id, input.photoId), eq(photos.profileId, ctx.profileId)))
      .returning({ id: photos.id, date: photos.date });
    if (!row) return { ok: false, error: "No photo with that id." };
    return { ok: true, deleted: row.date };
  },
});
