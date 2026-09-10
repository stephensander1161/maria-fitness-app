import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

suite("the marker on the movement she is on", () => {
  const css = fs.readFileSync("app/globals.css", "utf8");
  const frames = css.slice(css.indexOf("@keyframes now-glow"), css.indexOf("\n}", css.indexOf("@keyframes now-glow")));

  it("beats at one steady tempo, set in one place", () => {
    // It used to run at a rate read off the rest — fast just after a set,
    // settling as the clock ran down. On a card the size of a hand that was
    // two hard knocks and then a different tempo two seconds later, which
    // reads as a neon sign shorting out rather than as a pulse. Nothing sets
    // the duration per card any more.
    expect(css).toMatch(/\.now-glow \{ animation: now-glow 3\.6s/);
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).not.toMatch(/animationDuration/);
    expect(card).not.toMatch(/beatSeconds/);
    expect(fs.existsSync("lib/heartbeat.ts")).toBe(false);
  });

  it("is a pulse, not a swell", () => {
    // Two knocks then a pause — lub-dub. A single sine swell reads as
    // breathing, which is a different thing to say.
    expect(frames).toMatch(/10%/);
    expect(frames).toMatch(/32%/);
    // And the second knock does not overshoot the first: that was the part
    // that flickered. Measured on the glow's blur, which is the visible half.
    const glow = (pct: string) =>
      Number(frames.match(new RegExp(`${pct}\\s*\\{[^}]*?, 0 0 (\\d+)px`))?.[1] ?? 0);
    expect(glow("10%")).toBeGreaterThan(0);
    expect(glow("32%")).toBeLessThan(glow("10%"));
  });

  it("holds still before she starts", () => {
    // A card pulsing while she reads the day is urgency about a workout that
    // has not begun.
    expect(css).toMatch(/\.now-still \{/);
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/live \? "border-beat now-glow" : "border-beat now-still"/);
  });
});

suite("the sound that goes with it", () => {
  const src = fs.readFileSync("components/rest-timer.tsx", "utf8");

  it("is a few beats at the moment a set finishes, never a loop", () => {
    // A heartbeat running under her music for ninety seconds is a thing
    // anyone turns off inside one session.
    expect(src).toMatch(/export function heartbeat\(beats = 3/);
    const fn = src.slice(src.indexOf("export function heartbeat"));
    expect(fn.slice(0, fn.indexOf("\n}"))).not.toMatch(/setInterval|requestAnimationFrame/);
    expect(fs.readFileSync("components/rest-provider.tsx", "utf8")).toMatch(/heartbeat\(\);/);
  });

  it("is a thump, not a beep: low, falling, and short", () => {
    const fn = src.slice(src.indexOf("export function heartbeat"), src.indexOf("A notification, for the case"));
    expect(fn).toMatch(/\[0, 62, 0\.42\], \[0\.15, 48, 0\.26\]/);
    expect(fn).toMatch(/exponentialRampToValueAtTime\(hz \* 0\.6/);
  });

  it("stays silent when the browser has not let us make a sound", () => {
    // iOS suspends the context in the background; a missing thump must never
    // break the workout.
    const fn = src.slice(src.indexOf("export function heartbeat"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(/if \(ctx\.state !== "running"\) return;/);
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(/catch \{/);
  });
});

suite("the rest-timer runner turns at the burning edge", () => {
  it("scales its lap to how much rest is left, not the container", () => {
    // The right-hand bounce should come in as the meter drains, so he is
    // always running on the part of the bar that is still there.
    const src = fs.readFileSync("components/rest-timer.tsx", "utf8");
    expect(src).toMatch(/left: `\$\{\(lapPosition\(elapsed\) \/ 100\) \* pct\}%`/);
    expect(src).not.toMatch(/left: `\$\{lapPosition\(elapsed\)\}%`/);
  });
});
