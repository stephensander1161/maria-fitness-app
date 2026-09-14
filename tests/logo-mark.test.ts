import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { LOGO_MARKS, logoMarkIds, logoMarkOf } from "@/lib/logo-mark";
import { LAMELLAR, PAULDRON, TEMPLE_ROOF } from "@/lib/brand";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("which plate the app wears", () => {
  it("falls back rather than rendering nothing", () => {
    // A column holding a value some later version removed must still draw
    // something, and the something is the one the app shipped with. Same rule
    // as `themeOf`, for the same reason.
    expect(logoMarkOf(null).id).toBe("arc");
    expect(logoMarkOf(undefined).id).toBe("arc");
    expect(logoMarkOf("a-mark-that-was-removed").id).toBe("arc");
    expect(logoMarkOf("pauldron").id).toBe("pauldron");
  });

  it("gives every option a name and a reason", () => {
    for (const m of LOGO_MARKS) {
      expect(m.name.length, m.id).toBeGreaterThan(3);
      expect(m.blurb.length, m.id).toBeGreaterThan(20);
    }
    expect(new Set(logoMarkIds).size).toBe(LOGO_MARKS.length);
  });
});

suite("the marks that came out of the roof", () => {
  /*
    Six attempts at a shoulder plate were symmetrical domes, and every one read
    as a bell, a hat, a burger or a bowl. The reference that fixed it is the
    side of a Japanese roof: a high ridge, sides that sweep down **concave**
    rather than straight, and corners that flick out and up into points.

    Measured off the paths rather than asserted in prose, because "it looks
    like armour" is not something a test can hold and "its corners turn up" is.
  */
  const points = (d: string) =>
    [...d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)]
      .map((m) => ({ x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) }));

  it("bends rather than running straight", () => {
    // A triangle is the thing all of these are not.
    expect(PAULDRON.d).toMatch(/C/);
    expect(TEMPLE_ROOF.d).toMatch(/C/);
  });

  it("puts the roof's ridge in the middle and its tips above its base", () => {
    const p = points(TEMPLE_ROOF.d);
    const ridge = p.reduce((a, b) => (b.y < a.y ? b : a));
    expect(Math.abs(ridge.x - 24)).toBeLessThan(3);
    const base = Math.max(...p.map((q) => q.y));
    const leftTip = p.reduce((a, b) => (b.x < a.x ? b : a));
    expect(leftTip.y).toBeLessThan(base - 4);
  });

  it("makes the pauldron half of it, not the whole thing", () => {
    // A pauldron is one eave. The whole roof is its own option for anyone who
    // wants the temple instead of the armour.
    const p = points(PAULDRON.d);
    const spread = (q: { x: number }[]) => Math.max(...q.map((r) => r.x)) - Math.min(...q.map((r) => r.x));
    expect(spread(p)).toBeLessThan(spread(points(TEMPLE_ROOF.d)));
    // …and its mass sits to one side rather than either side of centre.
    const mean = p.reduce((n, q) => n + q.x, 0) / p.length;
    expect(Math.abs(mean - 24)).toBeGreaterThan(1);
  });

  it("keeps every corner clear of the badge's rounded edge", () => {
    /*
      A sheared tip is a flat one, and the upturned corners are the only
      feature that makes any of these legible small. The first pauldron put
      them at x = 1.4 and lost both of them in the sidebar at 26px. The badge
      is a 45-unit rect inset by 1.5 with a 14-unit radius.
    */
    for (const [name, d] of [["pauldron", PAULDRON.d], ["roof", TEMPLE_ROOF.d]] as const) {
      for (const q of points(d)) {
        expect(q.x, `${name} x`).toBeGreaterThan(2.5);
        expect(q.x, `${name} x`).toBeLessThan(45.5);
      }
    }
  });

  it("keeps the lamellar a stack rather than a dome", () => {
    // The cap is narrower than the lames under it, and each flares further
    // out than the one above — that is what makes it plates and not a shell.
    const leftmost = (d: string) => Math.min(...points(d).map((q) => q.x));
    const edges = LAMELLAR.lames.map(leftmost);
    for (let i = 1; i < edges.length; i++) expect(edges[i], `lame ${i}`).toBeLessThan(edges[i - 1]);
    expect(LAMELLAR.rotate).not.toBe(0);
  });
});

suite("the mark is hers; the icon is everyone's", () => {
  it("never lets the choice reach the icon routes", () => {
    /*
      A favicon is one URL for the whole origin, fetched without a session and
      cached by the browser for far longer than a person spends choosing. "The
      icon in her mark" is a promise this shape of thing cannot keep for even
      one visitor, let alone two on one machine — which is the same argument
      that keeps the icon off the theme. See lib/brand.ts.
    */
    for (const route of ["app/icon.tsx", "app/apple-icon.tsx"]) {
      const src = read(route);
      expect(src, route).not.toMatch(/logoMark|logo_mark|pauldron/);
    }
    // And the picker says so, rather than leaving her to notice.
    expect(read("components/logo-picker.tsx")).toMatch(/home-screen and browser-tab icons stay/i);
  });

  it("is written through the registry like every other setting", () => {
    expect(read("components/logo-picker.tsx")).toMatch(/action\("set_logo"/);
    // And it is askable, because a setting nobody finds is a setting nobody
    // has — "give me the armour one" is a sentence.
    const tools = read("lib/tools/appearance.ts");
    expect(tools).toMatch(/name: "set_logo"/);
    expect(tools).toMatch(/name: "list_logos"/);
  });
});
