import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { defineTool } from "./define";
import { THEMES, themeIds, themeOf } from "@/lib/theme";
import { LOGO_MARKS, logoMarkIds, logoMarkOf } from "@/lib/logo-mark";
import { CARDS, isCardId, isPageCard, orderFor, PAGE_CARDS, withCard, withHidden, withMoved, withMovementFold, type CardLayout, type Page } from "@/lib/cards";

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

/**
 * Which plate the app wears.
 *
 * The name is the joke and the joke is the feature: a plate is the thing on
 * the end of a bar and the thing dinner is on, and a pauldron is the third
 * kind. Asking for it is the natural way to change it — "give me the armour
 * one" is a sentence, and a setting nobody finds is a setting nobody has.
 */
const marks = () => LOGO_MARKS.map((m) => `${m.id} (${m.name}): ${m.blurb}`);

export const listLogos = defineTool({
  name: "list_logos",
  description:
    "Lists the marks the app can wear and says which one she is on. Use it before set_logo when she has not named one, or when she asks what the options are.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const [p] = await db.select({ logoMark: profiles.logoMark }).from(profiles)
      .where(eq(profiles.id, ctx.profileId)).limit(1);
    const current = logoMarkOf(p?.logoMark);
    return {
      current: { id: current.id, name: current.name },
      logos: LOGO_MARKS.map((m) => ({ id: m.id, name: m.name, about: m.blurb })),
    };
  },
});

export const setLogo = defineTool({
  name: "set_logo",
  description:
    "Changes the app's mark. Takes effect on her next screen. Use it when she asks for the armour one, the shoulder plate, the barbell one, or to change the logo. Options: "
    + marks().join("; ") + ".",
  input: z.object({
    logo: z.enum(logoMarkIds).describe("Which mark to wear"),
  }),
  handler: async (input, ctx) => {
    const chosen = logoMarkOf(input.logo);
    await db.update(profiles).set({ logoMark: chosen.id })
      .where(eq(profiles.id, ctx.profileId));
    return { ok: true, logo: chosen.id, name: chosen.name, note: `${chosen.name}. ${chosen.blurb}` };
  },
});

/**
 * Fold a card away, or bring it back.
 *
 * Remembered on the account rather than in the browser, so the choice follows
 * her between her phone and a laptop — the same reason the theme lives there.
 */
export const setCardCollapsed = defineTool({
  name: "set_card_collapsed",
  description:
    "Folds one of the screen's cards away, or opens it again, and remembers the choice. Use it when she says a section is in the way, that she does not use it, or asks to get it back. Cards: " +
    Object.entries(CARDS).map(([id, about]) => `${id} (${about})`).join("; ") + ".",
  input: z.object({
    card: z.string().describe("The card id, from the list in this description"),
    collapsed: z.boolean().describe("True folds it away; false opens it again"),
  }),
  handler: async (input, ctx) => {
    if (!isCardId(input.card)) {
      return { ok: false, error: `No card called "${input.card}". Options: ${Object.keys(CARDS).join(", ")}.` };
    }
    const [p] = await db.select({ collapsed: profiles.collapsedCards }).from(profiles)
      .where(eq(profiles.id, ctx.profileId)).limit(1);
    // A movement card is a pair of contradictory markers — folded, and
    // opened-on-purpose — so it is written as a pair. See lib/cards.ts.
    const movement = /^movement:(.+)$/.exec(input.card)?.[1];
    const next = movement
      ? withMovementFold(p?.collapsed, movement, input.collapsed)
      : withCard(p?.collapsed, input.card, !input.collapsed);
    await db.update(profiles).set({ collapsedCards: next })
      .where(eq(profiles.id, ctx.profileId));
    return { ok: true, card: input.card, collapsed: input.collapsed };
  },
});

const cardsOn = (page: Page) => PAGE_CARDS[page].map((c) => `${c.id} (${c.label}${c.hideable ? "" : ", cannot be hidden"})`).join(", ");

export const arrangeCards = defineTool({
  name: "arrange_cards",
  description:
    "Rearranges the cards on her Train or Eat screen — moves one up, down, to the top or the bottom, or hides and shows it. Use it when she says something like 'put the calculator at the top', 'I don't need the warm-up', or 'bring back the planned meals'. Train: " + cardsOn("train") + ". Eat: " + cardsOn("eat") + ".",
  input: z.object({
    page: z.enum(["train", "eat"]),
    card: z.string().describe("The card id, from the lists in this description"),
    move: z.enum(["up", "down", "top", "bottom"]).optional(),
    hidden: z.boolean().optional().describe("True hides the card; false brings it back"),
  }),
  handler: async (input, ctx) => {
    if (!isPageCard(input.page, input.card)) {
      return { ok: false, error: `No card called "${input.card}" on ${input.page}. Options: ${PAGE_CARDS[input.page].map((c) => c.id).join(", ")}.` };
    }
    if (input.move === undefined && input.hidden === undefined) {
      return { ok: false, error: "Say where it should go (move) or whether it is hidden." };
    }
    const [p] = await db.select({ cardLayout: profiles.cardLayout, collapsedCards: profiles.collapsedCards })
      .from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    let layout: CardLayout = (p?.cardLayout ?? {}) as CardLayout;
    let collapsed: string[] = p?.collapsedCards ?? [];
    if (input.move) layout = withMoved(input.page, layout, input.card, input.move);
    if (input.hidden !== undefined) {
      const card = PAGE_CARDS[input.page].find((c) => c.id === input.card)!;
      if (!card.hideable) return { ok: false, error: `${card.label} is the point of the screen and cannot be hidden.` };
      ({ layout, collapsed } = withHidden(input.page, layout, collapsed, input.card, input.hidden));
    }
    await db.update(profiles).set({ cardLayout: layout, collapsedCards: collapsed }).where(eq(profiles.id, ctx.profileId));
    return { ok: true, page: input.page, order: orderFor(input.page, layout), hidden: [...(layout[input.page]?.hidden ?? []), ...collapsed.filter((c) => c === "warmUp" || c === "coolDown")] };
  },
});
