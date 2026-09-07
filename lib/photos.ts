import { asc, desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import type { ISODate } from "@/lib/date";
import { deleteBlobs, getPrivate } from "@/lib/blob";

/**
 * Read model for progress photos, in the spirit of lib/views.ts: the screen
 * renders from here, and every write still goes back through the tool registry
 * (`add_progress_photo` / `delete_progress_photo`).
 *
 * This is the *only* place image data is read. Tools deliberately never return
 * it — see the note at the top of lib/tools/photos.ts — and the route that
 * serves an image (`/api/photos/[id]`) reads through `photoBytes` here, which
 * takes the profile id and puts it in the query. A photo id alone fetches
 * nothing.
 *
 * Where the bytes live: the private blob store when there is one
 * (`photos.blob_key`), Postgres otherwise (`photos.data`). The screen does not
 * know the difference — it gets a same-origin URL either way, which also
 * takes twenty base64 images out of every Progress page payload.
 */

export type PhotoPose = "front" | "side" | "back";

export type ProgressPhoto = {
  id: string;
  date: ISODate;
  pose: PhotoPose | null;
  /** Ready to drop straight into an <img src>: a same-origin route, session-gated. */
  src: string;
  width: number;
  height: number;
};

export type PhotoLibrary = {
  photos: ProgressPhoto[];
  /** How many she has in total, including any not carried in `photos`. */
  total: number;
};

/** The route that serves one photo to its owner. */
export const photoSrc = (id: string): string => `/api/photos/${id}`;

/**
 * Newest `limit` photos, plus her very first one if it falls outside that
 * window — the comparison defaults to oldest-vs-newest, so the bookend has to
 * be there.
 */
export async function photoLibrary(profileId: string, limit = 24): Promise<PhotoLibrary> {
  const columns = { id: photos.id, date: photos.date, pose: photos.pose, width: photos.width, height: photos.height };
  const rows = await db.select(columns).from(photos)
    .where(eq(photos.profileId, profileId))
    .orderBy(desc(photos.date), desc(photos.createdAt))
    .limit(limit);

  const total = await db.$count(photos, eq(photos.profileId, profileId));

  if (total > rows.length) {
    const [oldest] = await db.select(columns).from(photos)
      .where(eq(photos.profileId, profileId))
      .orderBy(asc(photos.date), asc(photos.createdAt))
      .limit(1);
    if (oldest && !rows.some((r) => r.id === oldest.id)) rows.push(oldest);
  }

  return {
    total,
    photos: rows.map((row) => ({
      id: row.id, date: row.date, pose: row.pose, src: photoSrc(row.id), width: row.width, height: row.height,
    })),
  };
}

export type PhotoBytes = { body: ReadableStream | Uint8Array; contentType: string };

/**
 * One photo's bytes, for its owner. The profile id is in the WHERE, not
 * checked afterwards, so someone else's id returns null rather than a row
 * that then has to be refused.
 */
export async function photoBytes(profileId: string, id: string): Promise<PhotoBytes | null> {
  const [row] = await db.select({ data: photos.data, blobKey: photos.blobKey }).from(photos)
    .where(and(eq(photos.id, id), eq(photos.profileId, profileId)))
    .limit(1);
  if (!row) return null;
  if (row.blobKey) {
    const stored = await getPrivate(row.blobKey);
    return stored ? { body: stored.stream, contentType: "image/jpeg" } : null;
  }
  if (row.data) return { body: Buffer.from(row.data, "base64"), contentType: "image/jpeg" };
  return null;
}

/**
 * Remove the stored images behind a set of rows that are being (or have just
 * been) deleted. Every path that deletes a photo row calls this with the keys
 * it got back, or `forgetPhotoBlobs` with the profile before a cascade — a
 * row gone from the table with its image still in the store is a photograph
 * of her body that she deleted and that still exists.
 */
export async function releasePhotoBlobs(rows: { blobKey: string | null }[]): Promise<number> {
  return deleteBlobs(rows.map((r) => r.blobKey));
}

/** Before a cascade deletes the rows: sweep the store for everything hers. */
export async function forgetPhotoBlobs(profileId: string): Promise<number> {
  const rows = await db.select({ blobKey: photos.blobKey }).from(photos).where(eq(photos.profileId, profileId));
  return releasePhotoBlobs(rows);
}
