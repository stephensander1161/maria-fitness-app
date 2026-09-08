import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { allowanceLeftPct, ALLOWANCE_WARN_PCT } from "@/lib/allowance-pct";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("the phone reaches the whole app", () => {
  it("builds the menu and the bottom row from one list", () => {
    // Two lists is how Friends and Admin reached the sidebar and nowhere on a
    // phone. One exported function, two consumers.
    expect(read("components/more-nav.tsx")).toMatch(/export function moreItems\(/);
    expect(read("components/mobile-menu.tsx")).toMatch(/moreItems\(isOwner, recovering\)/);
    expect(read("components/more-nav.tsx")).toMatch(/moreItems\(isOwner, recovering\)/);
  });

  it("carries the six main screens too, from the same list as the bottom bar", () => {
    // The bottom bar is position: fixed, and a phone browser's own toolbar
    // can sit on top of it — the owner could not reach Train or Plan at all.
    // The menu button is in normal flow, so every screen has to be in it.
    const menu = read("components/mobile-menu.tsx");
    expect(menu).toMatch(/import \{ TABS \} from "\.\/tab-bar"/);
    expect(menu).toMatch(/TABS\.map\(/);
    expect(menu).not.toMatch(/href="\/(train|plan|eat|progress|kitchen|learn)"/);
  });

  it("holds the page still while a dialog is open, and scrolls the panel instead", () => {
    // A thumb on the phone menu was scrolling the Train screen underneath.
    const hook = read("lib/use-dialog.ts");
    expect(hook).toMatch(/root\.style\.overflow = "hidden"/);
    // Put back exactly as it was, not blanked: a page that set its own
    // overflow would otherwise lose it after the first dialog.
    expect(hook).toMatch(/root\.style\.overflow = was\.overflow/);
    // Pinned at her offset and put back there, not sent to the top.
    expect(hook).toMatch(/body\.style\.top = `-\$\{y\}px`/);
    expect(hook).toMatch(/window\.scrollTo\(0, y\)/);
    // Giving focus back must not scroll to the button at the top either.
    expect(hook).toMatch(/opener\?\.focus\?\.\(\{ preventScroll: true \}\)/);
    const menu = read("components/mobile-menu.tsx");
    expect(menu).toMatch(/overscroll-contain/);
    expect(menu).toMatch(/max-h-\[85dvh\]/);
    expect(menu).toMatch(/items-start/);
    // The lock lives as long as the component that calls the hook. Called
    // from the always-mounted button, it held every page still from the
    // moment the greeting rendered — the hook belongs to the sheet.
    expect(menu.indexOf("useDialog(")).toBeGreaterThan(menu.indexOf("function MenuSheet"));
    expect(menu.slice(menu.indexOf("export function MobileMenu"), menu.indexOf("function MenuSheet"))).not.toMatch(/useDialog\(/);
  });

  it("puts the menu at the top, where it can be found without scrolling", () => {
    expect(read("components/mobile-greeting.tsx")).toMatch(/<MobileMenu /);
    // ...and it is a real dialog: trapped focus, Escape, focus restored.
    const menu = read("components/mobile-menu.tsx");
    expect(menu).toMatch(/useDialog\(/);
    expect(menu).toMatch(/aria-modal="true"/);
  });
});

suite("the allowance is not a cliff", () => {
  it("turns spend into a percentage left, bounded", () => {
    expect(allowanceLeftPct(0, 500_000)).toBe(100);
    expect(allowanceLeftPct(250_000, 500_000)).toBe(50);
    expect(allowanceLeftPct(500_000, 500_000)).toBe(0);
    expect(allowanceLeftPct(900_000, 500_000)).toBe(0);
    expect(allowanceLeftPct(100, 0)).toBe(0);
  });

  it("is sent as every turn ends, after that turn's usage is recorded", () => {
    const loop = read("lib/agent/loop.ts");
    const body = loop.slice(loop.indexOf("await recordUsage(message.usage"));
    expect(body.indexOf('type: "allowance"')).toBeGreaterThan(-1);
    expect(body.indexOf('type: "allowance"')).toBeLessThan(body.indexOf('type: "done"'));
  });

  it("is shown on both coach surfaces, near the composer", () => {
    for (const f of ["components/coach-bubble.tsx", "components/ask-coach.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/<AllowanceNote leftPct=\{allowance\} \/>/);
    }
    expect(ALLOWANCE_WARN_PCT).toBeLessThanOrEqual(30);
  });
});

