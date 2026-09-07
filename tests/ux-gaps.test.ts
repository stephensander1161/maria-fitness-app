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
