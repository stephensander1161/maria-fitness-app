import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * `position: fixed` has to mean the viewport.
 *
 * A transform on an ancestor — even `translateY(0)` — makes that element the
 * containing block for every fixed descendant and traps them in its stacking
 * context. PullToRefresh wraps the entire app and applied one permanently, so
 * every overlay inside a page quietly stopped being pinned to the screen: the
 * coach sheet pinned itself to the bottom of the *document* instead, and the
 * tab bar, a body-level sibling with a lower z-index, painted over it. On a
 * long page the sheet was below the fold entirely.
 *
 * The same is true of `filter`, `backdrop-filter`, `perspective`,
 * `will-change` and `contain: paint`. Any of them on a wrapper this high up
 * breaks every overlay under it, and does so silently — nothing errors, the
 * layout is just wrong somewhere else.
 */
const read = (p: string) => fs.readFileSync(p, "utf8");

suite("nothing above the page traps a fixed overlay", () => {
  it("pull-to-refresh only transforms while the gesture is happening", () => {
    const src = read("components/pull-to-refresh.tsx");
    // The transform is conditional, and absent — not "none" — at rest.
    expect(src).toMatch(/displaced\s*\?/);
    expect(src).toMatch(/const displaced =/);
    // And it must never be applied unconditionally again.
    expect(src).not.toMatch(/style=\{\{\s*\n?\s*transform: `translateY/);
  });

  it("the wrapper carries no class that would create a containing block", () => {
    // Tailwind utilities that do it: transform-*, filter/blur/backdrop-*,
    // perspective-*, will-change-transform, contain-paint.
    const src = read("components/pull-to-refresh.tsx");
    const banned = /className="[^"]*\b(backdrop-blur|blur-|perspective-|will-change-transform|contain-paint)\b/;
    expect(banned.test(src)).toBe(false);
  });

  it("the app shell does not wrap the page in one either", () => {
    const layout = read("app/layout.tsx");
    const banned = /className="[^"]*\b(backdrop-blur|perspective-|will-change-transform|contain-paint)\b[^"]*"[^>]*>\s*\{children\}/;
    expect(banned.test(layout)).toBe(false);
  });
});

suite("the pull indicator puts itself away", () => {
  it("resets the pull after a refresh instead of holding at the threshold", () => {
    // It used to return THRESHOLD and never clear it, so the banner read
    // "Let go to refresh" for ever — on every screen, until a hard reload.
    // The reset has to be inside the hold's own timeout. Looking for a
    // setPull(0) anywhere nearby passes on the one in the branch below, which
    // is a different code path and was never the bug.
    const src = read("components/pull-to-refresh.tsx");
    expect(src).toMatch(/setTimeout\(\(\) => \{[^}]*setRefreshing\(false\)[^}]*setPull\(0\)[^}]*\}, 700\)/);
  });
});

suite("every overlay is a real dialog", () => {
  it("sheets that claim to be modal trap focus", () => {
    // Duplicated from the accessibility suite on purpose: this file is about
    // overlays, and an overlay that lies to a screen reader is worse than one
    // that is merely in the wrong place.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (/\.tsx$/.test(e.name)) out.push(full);
      }
      return out;
    };
    const offenders = walk("components")
      .filter((f) => /aria-modal="true"/.test(read(f)))
      .filter((f) => !/useDialog\(/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
