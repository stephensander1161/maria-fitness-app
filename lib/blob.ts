import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";

/**
 * The one door to the blob store. Private access on every call — there is no
 * public blob in this app and no reason for one: the store holds the nightly
 * backup and photographs of her body.
 *
 * Optional, like Instacart: without BLOB_READ_WRITE_TOKEN photos go on living
 * in Postgres (lib/tools/photos.ts falls back) and the backup route answers
 * 503 rather than pretending.
 */
export const blobConfigured = (): boolean => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/**
 * Where a photo lives. Her profile in the path, so a store listing groups by
 * person and account deletion can sweep a prefix; a random name after it, so
 * the key cannot be guessed from the row id or the date.
 */
export const photoBlobKey = (profileId: string): string => `photos/${profileId}/${randomUUID()}.jpg`;

export async function putPrivate(key: string, body: Buffer | string, contentType: string): Promise<void> {
  await put(key, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
}

/** A readable body and its type, or null when the store has no such key. */
export async function getPrivate(key: string): Promise<{ stream: ReadableStream; contentType: string } | null> {
  const found = await get(key, { access: "private", useCache: false });
  if (!found || !found.stream) return null;
  return { stream: found.stream, contentType: found.blob.contentType ?? "application/octet-stream" };
}

/** Never throws for an empty list, and a missing key is not an error. */
export async function deleteBlobs(keys: (string | null)[]): Promise<number> {
  const real = keys.filter((k): k is string => typeof k === "string" && k.length > 0);
  if (real.length === 0) return 0;
  await del(real);
  return real.length;
}
