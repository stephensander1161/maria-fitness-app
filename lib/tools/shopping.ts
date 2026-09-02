import { z } from "zod";
import { audit } from "@/lib/audit";
import { prettyDate } from "@/lib/date";
import { createShoppingListPage, instacartConfigured, LINK_DAYS } from "@/lib/instacart";
import { normaliseItem } from "@/lib/pantry";
import { defineTool } from "./define";
import { shoppingListFor } from "@/lib/shopping-list";

/**
 * The shopping list, sent out of the app.
 *
 * Instacart is how Costco and most other grocers deliver in Canada, so this is
 * the difference between "here is what to buy" and the groceries turning up.
 * Only the list leaves — item names and quantities — and the departure is
 * audited, because it is her data going to a third party.
 */
export const sendShoppingListToInstacart = defineTool({
  name: "send_shopping_list_to_instacart",
  description:
    "Sends the week's shopping list to Instacart and returns a link that opens it as a cart ready to fill from Costco or any other store Instacart delivers from. Use it when she asks to order the groceries, send the list to Instacart or Costco, or get the shop delivered. Takes the same week and mid-week options as get_shopping_list, plus `items` to send only part of the list — pass the item names exactly as get_shopping_list returned them. Give her the link exactly as returned — it works for a week. If the result says Instacart is not connected, tell her it needs setting up on the server rather than guessing at a link.",
  input: z.object({
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
    fromDayOfWeek: z.number().optional().describe("Only from this day onward, 0=Monday — for a mid-week top-up shop"),
    items: z.array(z.string()).optional()
      .describe("Send only these items, named as get_shopping_list returned them. Omit to send the whole list."),
  }),
  handler: async (input, ctx) => {
    if (!instacartConfigured()) {
      return {
        ok: false,
        error: "Instacart isn't connected on this deployment. The list itself still works — get_shopping_list, or the Share button on the Plan screen.",
      };
    }
    const list = await shoppingListFor(ctx.profileId, input);
    if (!list.exists) return { ok: false, error: "No meal plan for that week yet — nothing to send." };
    const all = list.aisles.flatMap((a) => a.items);

    // A selection is a filter over the server's own list, never a list the
    // browser hands us: quantities still come from her meal plan, so nothing
    // that reaches Instacart was authored by the client.
    let items = all;
    let unmatched: string[] = [];
    if (input.items) {
      const wanted = new Set(input.items.map((i) => normaliseItem(i)));
      items = all.filter((i) => wanted.has(normaliseItem(i.item)));
      const got = new Set(items.map((i) => normaliseItem(i.item)));
      unmatched = [...wanted].filter((w) => !got.has(w));
    }
    if (items.length === 0) {
      return {
        ok: false,
        error: input.items
          ? "None of those items are on this week's list."
          : "The list is empty for those days.",
      };
    }

    let url: string;
    try {
      url = await createShoppingListPage({
        title: `Groceries — week of ${prettyDate(list.weekStart)}`,
        items,
      });
    } catch (err) {
      // Specific in the log, generic to her: the message names the failing
      // field or status, which is a fix-it detail, not something to relay.
      console.error("[instacart]", err);
      return { ok: false, error: "Instacart didn't take the list just now — try again in a minute." };
    }

    // Count only. What was on the list is her meal plan, and stays out of the log.
    await audit("data.shared", { detail: { profileId: ctx.profileId, to: "instacart", items: items.length } });

    return {
      ok: true,
      url,
      items: items.length,
      ofItems: all.length,
      // Named back, so a typo in a selection is visible rather than silently
      // shipping a shorter cart than she asked for.
      notOnTheList: unmatched,
      expiresInDays: LINK_DAYS,
      hint: "Give her the url verbatim so she can tap it. It opens a cart she can adjust before checking out.",
    };
  },
});
