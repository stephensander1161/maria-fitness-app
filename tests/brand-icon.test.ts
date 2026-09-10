import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { BRAND_MARK, BRAND_TILE, barbellFor, SMALL_AT } from "@/lib/brand";

const ROUTES = ["app/icon.tsx", "app/apple-icon.tsx", "app/icon-192/route.tsx", "app/icon-512/route.tsx"];

/** The same arithmetic tests/accessibility.test.ts uses on the palettes. */
function ratio(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

suite("the icon is neutral, and cannot be anything else", () => {
  it("carries no theme colour, in any of the four sizes", () => {
    // It used to be the app's orange: pick Turquoise and the tab still said
    // orange. It cannot follow the theme either — a favicon is one URL for the
    // whole origin, fetched without a session and cached far longer than
    // anyone spends choosing a colour.
    for (const route of ROUTES) {
      const src = fs.readFileSync(route, "utf8");
      expect(src, `${route} still paints an accent`).not.toMatch(/BRAND_ACCENT|#ff6a45|linear-gradient/);
      expect(src, `${route} does not use the neutral tile`).toMatch(/background: BRAND_TILE/);
      expect(src, `${route} does not draw the mark`).toMatch(/stroke=\{BRAND_MARK\}/);
    }
  });

  it("and the mark is readable on the tile", () => {
    // Small, and at an angle, so it is held to the outline floor rather than
    // the text one.
    expect(ratio(BRAND_MARK, BRAND_TILE)).toBeGreaterThanOrEqual(3);
  });

  it("still redraws below 22px rather than scaling down", () => {
    // Three strokes inside eleven usable pixels is mush. An icon is not the
    // big mark made small.
    expect(barbellFor(SMALL_AT - 1)).not.toEqual(barbellFor(SMALL_AT));
    expect(barbellFor(SMALL_AT - 1).plates.width).toBeGreaterThan(barbellFor(SMALL_AT).plates.width);
  });

  it("leaves the one piece of chrome that can follow the theme alone", () => {
    // The address bar colour is a meta tag rendered per request, so it may.
    expect(fs.readFileSync("app/layout.tsx", "utf8")).toMatch(/themeColor: theme\.themeColor/);
  });
});
