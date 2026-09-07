import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { TOOLBAR_MAX, coveredBottom } from "@/lib/viewport-cover";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("what the browser toolbar covers", () => {
  it("is the strip between the visual and layout viewports", () => {
    // Chrome on iOS: 852 tall page, 60px toolbar over the bottom of it.
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 792, scale: 1 })).toBe(60);
    // Scrolled inside the visual viewport (Safari's collapsing bars).
    expect(coveredBottom({ innerHeight: 852, offsetTop: 20, height: 772, scale: 1 })).toBe(60);
  });

  it("is nothing on a browser that shrinks the page instead", () => {
    expect(coveredBottom({ innerHeight: 792, offsetTop: 0, height: 792, scale: 1 })).toBe(0);
    expect(coveredBottom({ innerHeight: 792, offsetTop: 0, height: 800, scale: 1 })).toBe(0);
  });

  it("does not mistake the keyboard or a pinch zoom for a toolbar", () => {
    // Lifting the tab bar onto the keyboard would be worse than the problem.
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 500, scale: 1 })).toBe(0);
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 852 - TOOLBAR_MAX - 1, scale: 1 })).toBe(0);
    expect(coveredBottom({ innerHeight: 852, offsetTop: 0, height: 852 - TOOLBAR_MAX, scale: 1 })).toBe(TOOLBAR_MAX);
    expect(coveredBottom({ innerHeight: 852, offsetTop: 100, height: 300, scale: 2 })).toBe(0);
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
