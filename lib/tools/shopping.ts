import { z } from "zod";
import { audit } from "@/lib/audit";
import { prettyDate } from "@/lib/date";
import { createShoppingListPage, instacartConfigured, LINK_DAYS } from "@/lib/instacart";
import { defineTool } from "./define";
import { shoppingListFor } from "./nutrition";

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
    "Sends the week's shopping list to Instacart and returns a link that opens it as a cart ready to fill from Costco or any other store Instacart delivers from. Use it when she asks to order the groceries, send the list to Instacart or Costco, or get the shop delivered. Takes the same week and mid-week options as get_shopping_list. Give her the link exactly as returned — it works for a week. If the result says Instacart is not connected, tell her it needs setting up on the server rather than guessing at a link.",
  input: z.object({
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
    fromDayOfWeek: z.number().optional().describe("Only from this day onward, 0=Monday — for a mid-week top-up shop"),
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
    const items = list.aisles.flatMap((a) => a.items);
    if (items.length === 0) return { ok: false, error: "The list is empty for those days." };

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
      expiresInDays: LINK_DAYS,
      hint: "Give her the url verbatim so she can tap it. It opens a cart she can adjust before checking out.",
    };
  },
});
