import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { INSTACART_STORES } from "@/components/kitchen";
const read = (p: string) => fs.readFileSync(p, "utf8");

suite("the Kitchen, as one list — 2026-09-18", () => {
  /*
    "It needs an overhaul. UI/UX is bad." It was a grid of fifty-five
    identical tiles with the amounts cut off, and then the same food again
    as a shopping list a screen's height below. Now one list, two views.
  */
  const page = read("app/kitchen/page.tsx");
  const src = read("components/kitchen.tsx");

  it("draws the food once, in two views, and the old grid and list are gone", () => {
    expect(fs.existsSync("components/kitchen-grid.tsx")).toBe(false);
    expect(fs.existsSync("components/shopping-list.tsx")).toBe(false);
    expect(page).toMatch(/<Kitchen\n/);
    expect(src).toMatch(/role="tablist"/);
    expect(src).toMatch(/md:grid md:grid-cols-2/);
    expect(page).not.toMatch(/Work in progress/);
  });

  it("opens on whichever view has work in it", () => {
    expect(src).toMatch(/useState<View>\(toBuy\.length > 0 \? "buy" : "have"\)/);
  });

  it("every line says how many meals want it and what she already has", () => {
    expect(src).toMatch(/for \$\{line\.fromMeals\} meal/);
    expect(src).toMatch(/you have some — uncounted/);
    expect(src).toMatch(/\$\{line\.shortBy\} short/);
  });

  it("the header count is the list's count", () => {
    expect(page).toMatch(/filter\(\(i\) => i\.inKitchen !== "have"\)\.length/);
  });

  it("the actions sit where a thumb is, and name the retailers Instacart reaches", () => {
    expect(src).toMatch(/data-shopping-actions=""/);
    expect(src).toMatch(/fixed inset-x-0 z-30[^"]*md:static/);
    expect(INSTACART_STORES).toMatch(/Costco/);
    expect(src).toMatch(/send_shopping_list_to_instacart/);
    expect(src).toMatch(/mark_shopping_bought/);
  });

  it("one row per thing in the kitchen, by the normalised name", () => {
    const views = read("lib/views.ts");
    expect(views).toMatch(/const byName = new Map<string, string>\(\);/);
    expect(views).toMatch(/if \(!byName\.has\(key\)\) byName\.set\(key, item\);/);
  });
});
