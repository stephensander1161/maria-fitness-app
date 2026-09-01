import { env } from "@/lib/env";
import { formatAmount, type ShoppingItem } from "@/lib/shopping";

/**
 * Instacart Developer Platform — the "create shopping list page" call.
 *
 * Costco (and most other grocers in Canada) deliver through Instacart, so
 * this is how the week's list becomes a cart without retyping it. The call
 * returns a URL; opening it lets her pick a store and fill a cart from the
 * list. Nothing about her account goes with it — just what to buy.
 *
 * The API accepts a fixed set of units. Anything else is sent as a count of
 * one with the original wording as the display text, so "4 cloves garlic"
 * lands as one garlic labelled exactly that rather than being dropped.
 */

export type LineItem = {
  name: string;
  quantity: number;
  unit: string;
  display_text?: string;
};

/** Our unit words → Instacart's accepted set. */
const UNITS: Record<string, string> = {
  g: "g", kg: "kg", ml: "ml", l: "l", oz: "oz", lb: "lb", lbs: "lb",
  tsp: "teaspoon", tsps: "teaspoon", teaspoon: "teaspoon", teaspoons: "teaspoon",
  tbsp: "tablespoon", tbsps: "tablespoon", tablespoon: "tablespoon", tablespoons: "tablespoon",
  cup: "cup", cups: "cup",
  tin: "can", tins: "can", can: "can", cans: "can",
  bunch: "bunch", bunches: "bunch",
  pack: "package", packs: "package", pouch: "package", pouches: "package",
};

export const instacartConfigured = (): boolean => Boolean(env.INSTACART_API_KEY);

export function toLineItems(items: ShoppingItem[]): LineItem[] {
  return items.map((i) => {
    if (i.amount === null) return { name: i.item, quantity: 1, unit: "each" };
    if (i.unit === null) return { name: i.item, quantity: i.amount, unit: "each" };
    const unit = UNITS[i.unit.toLowerCase()];
    if (unit) return { name: i.item, quantity: i.amount, unit };
    return {
      name: i.item,
      quantity: 1,
      unit: "each",
      display_text: `${formatAmount(i.amount)} ${i.unit} ${i.item}`,
    };
  });
}

const HOSTS = {
  production: "https://connect.instacart.com",
  development: "https://connect.dev.instacart.tools",
};

/** How long the link stays live, in days. A week's list is stale after a week. */
export const LINK_DAYS = 7;

/** Creates the page and returns its URL. Throws on any failure; the caller
 *  turns that into something she can act on. */
export async function createShoppingListPage(opts: {
  title: string;
  items: ShoppingItem[];
}): Promise<string> {
  const key = env.INSTACART_API_KEY;
  if (!key) throw new Error("INSTACART_API_KEY is not set");

  const body = {
    title: opts.title,
    link_type: "shopping_list",
    expires_in: LINK_DAYS,
    line_items: toLineItems(opts.items),
    landing_page_configuration: {
      // Enable pantry items: lets her untick what she already has at home.
      enable_pantry_items: true,
      ...(env.APP_URL ? { partner_linkback_url: `${env.APP_URL}/plan` } : {}),
    },
  };

  const res = await fetch(`${HOSTS[env.INSTACART_ENV]}/idp/v1/products/products_link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // The response body names the rejected field, which is what you need to
    // fix it; it never carries the key.
    const text = await res.text().catch(() => "");
    throw new Error(`Instacart answered ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { products_link_url?: string };
  if (!json.products_link_url) throw new Error("Instacart returned no link");
  return json.products_link_url;
}
