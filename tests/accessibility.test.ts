import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Structural accessibility rules, checked the only way CI can check them.
 *
 * These are not stylistic. Each one is a way the app can look finished and be
 * unusable — or, worse, lie: `aria-modal="true"` over a dialog you can Tab out
 * of tells a screen reader the rest of the page is inert while she edits it
 * blind, and a save that fails silently is silent for everyone but announced
 * to nobody.
 */
const read = (p: string) => fs.readFileSync(p, "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(e.name)) out.push(full);
  }
  return out;
};

const screens = [...walk("components"), ...walk("app")];

suite("a dialog behaves like one", () => {
  it("every aria-modal sheet traps focus and restores it", () => {
    const offenders = screens
      .filter((f) => /aria-modal="true"/.test(read(f)))
      .filter((f) => !/useDialog\(/.test(read(f)));
    expect(
      offenders,
      `these claim to be modal but Tab walks out of them into the page behind: ${offenders.join(", ")}. ` +
      "Use useDialog().",
    ).toEqual([]);
  });
});

suite("a failure is announced, not just coloured", () => {
  it("error text carries role=alert", () => {
    // Colour is not an announcement. Twenty-one error paragraphs used to be
    // rendered to nobody at all.
    const offenders: string[] = [];
    for (const file of screens) {
      const src = read(file);
      for (const m of src.matchAll(/<p className="[^"]*text-miss[^"]*">\{\w*[Ee]rror\w*\}/g)) {
        offenders.push(`${file}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(offenders, `unannounced errors: ${offenders.join(" | ")}`).toEqual([]);
  });
});

suite("the timer does not talk over everything", () => {
  it("no aria-live on a value that repaints every frame", () => {
    const src = read("components/rest-timer.tsx");
    // A 90-second rest at 4Hz is ~360 queued announcements, each blocking the
    // next — materially worse than saying nothing at all.
    expect(src).not.toMatch(/aria-live=["']polite["'][\s\S]{0,200}clock\(ms\)/);
  });
});

suite("contrast", () => {
  /** WCAG relative luminance, then the contrast ratio between two hexes. */
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const token = (name: string) => {
    const m = read("app/globals.css").match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
    if (!m) throw new Error(`no --color-${name}`);
    return m[1];
  };

  it("faint text clears 4.5:1 on every surface it sits on", () => {
    // It carries the inactive tab labels, every placeholder, and the calorie
    // target she eats against — all at 10-13px, so no large-text exemption.
    for (const bg of ["base", "surface", "raised"]) {
      expect(ratio(token("faint"), token(bg)), `faint on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a control's outline clears 3:1, because an unticked box is information", () => {
    // --color-line stays decorative (dividers, card edges). --color-edge is
    // the boundary of something she has to see to use: an unticked checkbox,
    // a set not yet logged, an input.
    for (const bg of ["base", "surface", "raised"]) {
      expect(ratio(token("edge"), token(bg)), `edge on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("muted text and the accent still pass where they already did", () => {
    expect(ratio(token("muted"), token("base"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token("accent"), token("base"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token("ink"), token("accent"))).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The app was built thumb-first and then had to work on a desktop too. These
 * are the three ways that goes wrong silently: navigation that only exists at
 * the bottom edge of a phone, sheets that rise from an edge a mouse is nowhere
 * near, and a refresh that only a finger can perform.
 */
suite("it works with a mouse too", () => {
  it("has navigation that survives the tab bar being hidden", () => {
    // The bottom bar is display:none from md up, so something else has to
    // carry the destinations — and from the same list, or they drift.
    expect(read("components/tab-bar.tsx")).toMatch(/md:hidden/);
    expect(read("components/side-nav.tsx")).toMatch(/from "\.\/tab-bar"/);
    expect(read("components/tab-bar.tsx")).toMatch(/export const TABS/);
  });

  it("gives every bottom sheet a desktop position", () => {
    // An 88dvh sheet glued to the bottom edge of a 27-inch screen is a phone
    // app in a window.
    const sheets = screens.filter((f) => /items-end justify-center/.test(read(f)));
    expect(sheets.length).toBeGreaterThan(3);
    const stuck = sheets.filter((f) => !/md:(items-center|justify-center|self-auto)/.test(read(f)));
    expect(stuck, `these still rise from the bottom edge on a desktop: ${stuck.join(", ")}`).toEqual([]);
  });

  it("can refresh without a touch gesture", () => {
    // pull-to-refresh binds touch events only, and every page is
    // force-dynamic — so on a desktop there was no way to reload a screen
    // from inside the app at all. It used to be a button in the sidebar,
    // which is the app asking her to do its job; now returning to the tab is
    // the signal. What matters either way is that a mouse-only user has a
    // path to fresh data that is not a gesture they cannot make.
    const onFocus = read("components/refresh-on-focus.tsx");
    expect(onFocus).toMatch(/router\.refresh\(\)/);
    expect(onFocus).toMatch(/visibilitychange/);
    // And it is actually mounted, or the whole thing is a file nobody runs.
    expect(read("app/layout.tsx")).toMatch(/<RefreshOnFocus\s*\/>/);
  });
});

/**
 * A desktop layout is an information architecture, not a wider column. These
 * check the three structural decisions rather than the styling: the window is
 * the frame, the library is master-detail, and the panes that make sense
 * side by side are side by side.
 */
suite("the desktop layout is a layout", () => {
  it("makes the window the frame and scrolls the pane inside it", () => {
    // A document that scrolls as a whole is a web page. An app holds still and
    // moves its contents.
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/md:h-dvh md:overflow-hidden/);
    // A flex row, not a fixed sidebar and a matching padding: the two have to
    // agree on a width, and when they disagreed the content landed off to the
    // right of the window with no clue why.
    expect(layout).toMatch(/md:flex md:h-dvh/);
    expect(layout).toMatch(/md:flex-1 md:overflow-y-auto/);
  });

  it("renders the library as list and detail together", () => {
    const page = read("app/learn/page.tsx");
    expect(page).toMatch(/searchParams/);
    expect(page).toMatch(/MovementDetail/);
    // And the list keeps its own scroll, or 125 movements push the detail
    // off the bottom of the screen.
    expect(page).toMatch(/md:sticky[^"]*md:overflow-y-auto/);
  });

  it("shows one movement through one component, whichever screen it is on", () => {
    // The page and the pane rendering different markup is how they drift.
    expect(read("app/learn/[slug]/page.tsx")).toMatch(/MovementDetail/);
    expect(read("app/learn/page.tsx")).toMatch(/MovementDetail/);
  });

  it("drops the Plan tabs where both panes fit", () => {
    const plan = read("components/plan-client.tsx");
    expect(plan).toMatch(/lg:hidden/);
    expect(plan).toMatch(/lg:grid lg:grid-cols-2/);
  });
});
