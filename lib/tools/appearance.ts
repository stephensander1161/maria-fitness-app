import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { defineTool } from "./define";
import { THEMES, themeIds, themeOf } from "@/lib/theme";

/**
 * How the app looks, changeable by asking.
 *
 * The point of this app is that anything she can tap she can also ask for, and
 * "put it in light mode" is one of the most natural sentences anyone says to
 * an app. The palettes themselves live in app/globals.css; lib/theme.ts is the
 * list, and every one of them is held to the same contrast floors.
 */

const summary = () => THEMES.map((t) => `${t.id} (${t.name}, ${t.scheme}): ${t.blurb}`);

export const listThemes = defineTool({
  name: "list_themes",
  description:
    "Lists the looks she can choose from — light ones, dark ones, and a high-contrast one — with a line about when each suits. Use it before set_theme when she has not named one, or when she asks what the options are.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const [p] = await db.select({ theme: profiles.theme }).from(profiles)
      .where(eq(profiles.id, ctx.profileId)).limit(1);
    const current = themeOf(p?.theme);
    return {
      current: { id: current.id, name: current.name },
      themes: THEMES.map((t) => ({ id: t.id, name: t.name, scheme: t.scheme, about: t.blurb })),
    };
  },
});

export const setTheme = defineTool({
  name: "set_theme",
  description:
    "Changes how the app looks — light, dark, warm, cool, or high contrast. Takes effect on her next screen. Use it whenever she asks for light mode, dark mode, a different colour, or says the app is hard to read in bright light, in which case 'contrast' is the one to reach for. Options: " +
    summary().join("; ") + ".",
  input: z.object({
    theme: z.enum(themeIds).describe("Which look to switch to"),
  }),
  handler: async (input, ctx) => {
    const chosen = themeOf(input.theme);
    await db.update(profiles).set({ theme: chosen.id })
      .where(eq(profiles.id, ctx.profileId));
    return { ok: true, theme: chosen.id, name: chosen.name, note: `Switched to ${chosen.name}. ${chosen.blurb}` };
  },
});
