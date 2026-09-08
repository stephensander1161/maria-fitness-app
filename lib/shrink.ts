"use client";

/**
 * One image shrinker, for every screen that takes a photo.
 *
 * Progress photos had this to themselves; the recipe scanner needs exactly
 * the same thing — 800px, JPEG, and no EXIF — and a second copy is how the
 * two would drift on the one detail that matters most, which is the GPS
 * coordinates a phone attaches by default.
 */
export const MAX_EDGE = 800;
export const QUALITY = 0.75;
/** ~300KB of JPEG. Base64 is 4 chars per 3 bytes. */
export const MAX_BASE64_CHARS = 400_000;

export type Shrunk = { src: string; width: number; height: number };

/**
 * Resize to MAX_EDGE on the long edge and re-encode as JPEG.
 *
 * Two things fall out of the canvas re-encode for free: a 4MB phone photo turns
 * into ~100KB of base64 that Postgres can hold for years, and every scrap of
 * EXIF goes with it — including the GPS coordinates of her bedroom, which phone
 * cameras attach by default and which must never reach the database.
 */
export async function shrink(file: File): Promise<Shrunk> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser wouldn't resize that photo.");
  ctx.drawImage(img, 0, 0, width, height);

  let src = canvas.toDataURL("image/jpeg", QUALITY);
  // One more squeeze before giving up — busy backgrounds compress badly.
  if (src.length > MAX_BASE64_CHARS) src = canvas.toDataURL("image/jpeg", 0.6);
  if (src.length > MAX_BASE64_CHARS) {
    throw new Error(
      `That photo is still about ${Math.round(src.length * 0.75 / 1024)}KB after resizing. Try a normal camera photo rather than a screenshot or panorama.`,
    );
  }

  return { src, width, height };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo — try taking it again."));
    };
    // Browsers apply the EXIF orientation when drawing an <img> to a canvas, so
    // portrait photos from the phone don't land on their side.
    img.src = url;
  });
}
