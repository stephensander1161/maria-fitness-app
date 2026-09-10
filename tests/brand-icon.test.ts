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

suite("the icons render without sharp", () => {
  /*
    next.config.ts excludes sharp from every function's traced bundle: nothing
    in this app decodes or resizes an image on the server — a progress photo is
    resized in the browser before upload, which is why add_progress_photo is
    the one uiOnly tool — and the tracer was shipping 28MB of it into all
    twenty-odd routes, /privacy included. A hundred retained deployments of
    that is what filled 75% of the free tier's function storage.

    The one thing that could have needed it is these four, because they
    actually produce PNG bytes. They rasterise through resvg rather than sharp,
    so they are fine — but "so they are fine" is exactly the kind of claim that
    is true until a dependency changes it quietly, and the failure mode is a
    broken favicon on a deployed app rather than anything a build would catch.
    So each one is rendered here.
  */
  const routes = [
    ["app/icon.tsx", () => import("@/app/icon")],
    ["app/apple-icon.tsx", () => import("@/app/apple-icon")],
    ["app/icon-192/route.tsx", () => import("@/app/icon-192/route")],
    ["app/icon-512/route.tsx", () => import("@/app/icon-512/route")],
  ] as const;

  for (const [name, load] of routes) {
    it(`${name} produces a PNG`, async () => {
      const mod = await load() as Record<string, unknown>;
      const handler = (mod.default ?? mod.GET) as () => Response;
      const res = await handler();
      expect(res.headers.get("content-type")).toContain("image/png");

      const bytes = new Uint8Array(await res.arrayBuffer());
      // The PNG magic number. A zero-length body also "renders".
      expect(bytes.length).toBeGreaterThan(200);
      expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }, 30_000);
  }

  it("keeps sharp out of the traced bundle", () => {
    const config = fs.readFileSync("next.config.ts", "utf8");
    expect(config).toMatch(/outputFileTracingExcludes/);
    expect(config).toMatch(/node_modules\/sharp\/\*\*/);
    expect(config).toMatch(/node_modules\/@img\/\*\*/);
  });

  it("has nothing on the server that would want it", () => {
    // The moment something does, the exclusion above becomes a runtime crash
    // on a path no test covers — so the import is what is guarded, not a
    // memory of why it was safe.
    const server = [
      ...fs.readdirSync("lib").map((f) => `lib/${f}`),
      ...fs.readdirSync("lib/tools").map((f) => `lib/tools/${f}`),
    ].filter((f) => f.endsWith(".ts"));
    for (const file of server) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${file} imports sharp — see outputFileTracingExcludes in next.config.ts`)
        .not.toMatch(/from ["']sharp["']|require\(["']sharp["']\)/);
    }
  });
});
