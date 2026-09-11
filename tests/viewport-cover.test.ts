import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { TOOLBAR_MAX, TOOLBAR_MIN, coveredBottom, coversFixedElements } from "@/lib/viewport-cover";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("what the browser toolbar covers", () => {
  it("is the strip between the visual and layout viewports", () => {
    // Chrome on iOS: 852 tall page, 60px toolbar over the bottom of it.
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 792, scale: 1, overlays: true })).toBe(60);
    // Scrolled inside the visual viewport (collapsing bars).
    expect(coveredBottom({ innerHeight: 852, offsetTop: 20, height: 772, scale: 1, overlays: true })).toBe(60);
  });

  it("is nothing on a browser that shrinks the page instead", () => {
    expect(coveredBottom({ innerHeight: 792, offsetTop: 0, height: 792, scale: 1, overlays: true })).toBe(0);
    expect(coveredBottom({ innerHeight: 792, offsetTop: 0, height: 800, scale: 1, overlays: true })).toBe(0);
  });

  it("does not mistake the keyboard or a pinch zoom for a toolbar", () => {
    // Lifting the tab bar onto the keyboard would be worse than the problem.
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 500, scale: 1, overlays: true })).toBe(0);
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 852 - TOOLBAR_MAX - 1, scale: 1, overlays: true })).toBe(0);
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 852 - TOOLBAR_MAX, scale: 1, overlays: true })).toBe(TOOLBAR_MAX);
    expect(coveredBottom({ innerHeight: 852, offsetTop: 100, height: 300, scale: 2, overlays: true })).toBe(0);
  });

  it("is nothing at all on a browser that keeps fixed elements clear", () => {
    /*
      The bug: iOS Safari pins `position: fixed` to the visual viewport, so
      `bottom: 0` already sits above its toolbar. Adding the strip lifted the
      tab bar a toolbar's height off the bottom with the page still visible
      underneath, and moved it every time the toolbar grew through a scroll.
    */
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 792, scale: 1, overlays: false })).toBe(0);
    // …and the same numbers are still a toolbar on a browser that overlays.
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 792, scale: 1, overlays: true })).toBe(60);
  });

  it("knows which browsers overlay, and assumes none by default", () => {
    const criOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
    const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
    const chromeDesktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
    expect(coversFixedElements(criOS)).toBe(true);
    expect(coversFixedElements(safari)).toBe(false);
    // Chrome on iOS carries "Safari" in its UA and desktop Chrome carries
    // "Chrome" — neither substring on its own decides this.
    expect(coversFixedElements(chromeDesktop)).toBe(false);
    expect(coversFixedElements("")).toBe(false);
  });

  it("does not move for a few pixels of scroll jitter", () => {
    // The visual viewport shifts through a momentum scroll and a rubber-band,
    // and every one of those fired an update that moved the bar.
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 852 - 6, scale: 1, overlays: true })).toBe(0);
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 852 - TOOLBAR_MIN + 1, scale: 1, overlays: true })).toBe(0);
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 852 - TOOLBAR_MIN, scale: 1, overlays: true })).toBe(TOOLBAR_MIN);
  });

  it("is applied to every bottom-anchored surface, and the tab bar moves whole", () => {
    expect(read("app/layout.tsx")).toMatch(/<ViewportCover \/>/);
    expect(read("components/tab-bar.tsx")).toMatch(/bottom: "var\(--covered-bottom, 0px\)"/);
    // Every safe-area bottom padding in a component adds the covered strip.
    // The tab bar is the exception: the whole strip moves via `bottom`
    // (asserted above), so its inner padding stays the safe area alone.
    const files = fs.readdirSync("components").filter((f) => f.endsWith(".tsx") && f !== "tab-bar.tsx");
    for (const f of files) {
      const src = read(`components/${f}`);
      for (const m of src.matchAll(/(paddingBottom|bottom): "([^"]*safe-area-inset-bottom[^"]*)"/g)) {
        expect(m[2], `components/${f}: ${m[0]}`).toMatch(/var\(--covered-bottom, 0px\)/);
      }
    }
  });
});
