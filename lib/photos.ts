import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import type { ISODate } from "@/lib/date";

/**
 * Read model for progress photos, in the spirit of lib/views.ts: the screen
 * renders from here, and every write still goes back through the tool registry
 * (`add_progress_photo` / `delete_progress_photo`).
 *
 * This is the *only* place image data is read. Tools deliberately never return
 * it — see the note at the top of lib/tools/photos.ts.
 */

export type PhotoPose = "front" | "side" | "back";

export type ProgressPhoto = {
  id: string;
  date: ISODate;
  pose: PhotoPose | null;
  /** Ready to drop straight into an <img src>. Inline data URI, no network. */
  src: string;
  width: number;
  height: number;
};

export type PhotoLibrary = {
  photos: ProgressPhoto[];
  /** How many she has in total, including any not carried in `photos`. */
  total: number;
};

/**
 * Newest `limit` photos, plus her very first one if it falls outside that
 * window — the comparison defaults to oldest-vs-newest, so the bookend has to
 * be there. Photos travel to the browser as base64 in the page payload, hence
 * the cap: each one is roughly 60–120KB.
 */
export async function photoLibrary(profileId: string, limit = 24): Promise<PhotoLibrary> {
  const rows = await db.select().from(photos)
    .where(eq(photos.profileId, profileId))
    .orderBy(desc(photos.date), desc(photos.createdAt))
    .limit(limit);

  const total = await db.$count(photos, eq(photos.profileId, profileId));

  if (total > rows.length) {
    const [oldest] = await db.select().from(photos)
      .where(eq(photos.profileId, profileId))
      .orderBy(asc(photos.date), asc(photos.createdAt))
      .limit(1);
    if (oldest && !rows.some((r) => r.id === oldest.id)) rows.push(oldest);
  }

  return { total, photos: rows.map(toProgressPhoto) };
}

function toProgressPhoto(row: typeof photos.$inferSelect): ProgressPhoto {
  return {
    id: row.id,
    date: row.date,
    pose: row.pose,
    // Inline data URI: nothing about her body ever leaves the page, and the CSP
    // (img-src 'self' data: blob:) allows exactly this and no external host.
    src: `data:image/jpeg;base64,${row.data}`,
    width: row.width,
    height: row.height,
  };
}
