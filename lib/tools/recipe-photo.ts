import { z } from "zod";
import { readRecipePhoto } from "@/lib/agent/planner";
import { getProfileById } from "@/lib/profile";
import { defineTool } from "./define";

/**
 * A photograph of a recipe, turned into numbers she can log.
 *
 * Maria asked for this from the Eat screen: "let me add a photo of a recipe,
 * and you estimate the macros and calories for it."
 *
 * The same rule as lib/tools/photos.ts: **no handler ever returns image data,
 * and none of it is stored.** The bytes go to the model with the request and
 * are gone when it returns — there is no row, no blob key, and nothing in the
 * conversation, because a single photo is ~135,000 base64 characters and one
 * of them in the context window costs more than a month of normal use.
 *
 * Logging is a separate step through log_meal, deliberately. An estimate that
 * wrote itself into her day would be the app deciding a number it admits it
 * is unsure of; she sees the range and the assumptions first, and the numbers
 * only land when she says so.
 */

/** The UI resizes to 800px at ~0.75 quality — the same shrink() as progress
 *  photos, so the same ceiling applies as a backstop. */
const MAX_BASE64_CHARS = 400_000;
const MAX_KB = Math.round((MAX_BASE64_CHARS * 3) / 4 / 1024);
const JPEG_DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;

export const estimateRecipeFromPhoto = defineTool({
  name: "estimate_recipe_from_photo",
  uiOnly:
    "takes a resized JPEG data URL that only the browser canvas can produce; the model cannot generate an image",
  slow: "planner",
  description:
    "Read a photo she has just taken — a recipe page, a food label, or a plate of food — and return per-serving calories and macros, with the assumptions behind them. The app calls this from the camera button on the Eat screen; you cannot produce image data yourself. It estimates only: nothing is logged until she says so, and the photo is not kept.",
  input: z.object({
    image: z.string().describe("A `data:image/jpeg;base64,…` URL, already resized by the browser."),
    note: z.string().optional().describe("Anything she typed alongside it — 'this makes 4', 'no oil'."),
  }),
  handler: async (input, ctx) => {
    const match = JPEG_DATA_URL.exec(input.image.trim());
    if (!match) return { ok: false, error: "Photos must be a data:image/jpeg;base64 URL produced by the app." };
    const base64 = match[1];
    if (base64.length > MAX_BASE64_CHARS) {
      return { ok: false, error: `That photo is about ${Math.round((base64.length * 3) / 4 / 1024)}KB after resizing, over the ${MAX_KB}KB limit.` };
    }

    const profile = await getProfileById(ctx.profileId);
    if (!profile) return { ok: false, error: "No profile." };

    // A model call that comes back unusable is a sentence to her, not a
    // stack trace: this runs from a button, and the answer either arrives or
    // she takes the photo again.
    let read;
    try {
      read = await readRecipePhoto(profile, { mediaType: "image/jpeg", base64 }, input.note);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: /too long|timed out/i.test(detail)
          ? "That took too long to read. Try again in a moment."
          : "Couldn't read that one. A straighter photo of the whole recipe, or the plate itself, usually does it.",
      };
    }
    if (!read.readable) {
      return { ok: false, error: read.note || "That doesn't look like food — try a recipe page, a label, or the plate itself." };
    }

    // Metadata only on the way back out — deliberately not the image.
    return {
      ok: true,
      title: read.title,
      servings: read.servings,
      perServing: {
        calories: read.caloriesPerServing,
        caloriesLow: read.caloriesLow,
        caloriesHigh: read.caloriesHigh,
        proteinG: read.proteinG,
        fibreG: read.fibreG ?? null,
        carbsG: read.carbsG,
        fatG: read.fatG,
      },
      assumptions: read.assumptions,
      note: read.note,
      /** Said plainly wherever this is shown: it is an estimate from a picture. */
      estimate: true,
    };
  },
});
