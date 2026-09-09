import { describe as suite, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import { BEAT_CALM_S, BEAT_FAST_S, beatSeconds } from "@/lib/heartbeat";

/**
 * The marker on the current movement beats like a heart rate: quick the
 * moment a set is finished, settling as the rest runs down. That is the right
 * way round — it is recovery, not a countdown getting urgent.
 */
suite("how fast the marker beats", () => {
  it("is quickest at the start of the rest and calmest at the end", () => {
    expect(beatSeconds(90_000, 90_000)).toBe(BEAT_FAST_S);
    expect(beatSeconds(0, 90_000)).toBe(BEAT_CALM_S);
    // Faster means a shorter duration.
    expect(BEAT_FAST_S).toBeLessThan(BEAT_CALM_S);
  });

  it("settles smoothly through the rest", () => {
    const half = beatSeconds(45_000, 90_000);
    expect(half).toBeGreaterThan(BEAT_FAST_S);
    expect(half).toBeLessThan(BEAT_CALM_S);
    // Monotonic: every step of the rest is calmer than the one before.
    const steps = [1, 0.75, 0.5, 0.25, 0].map((f) => beatSeconds(f * 90_000, 90_000));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it("sits calm with no rest running, and cannot be broken by a bad clock", () => {
    // Between movements, or the app just opened.
    expect(beatSeconds(null, null)).toBe(BEAT_CALM_S);
    expect(beatSeconds(NaN, 90_000)).toBe(BEAT_CALM_S);
    expect(beatSeconds(90_000, 0)).toBe(BEAT_CALM_S);
    // A rest run past its end does not beat backwards.
    expect(beatSeconds(-5_000, 90_000)).toBe(BEAT_CALM_S);
    // Nor does a clock that says more is left than the rest was long.
    expect(beatSeconds(200_000, 90_000)).toBe(BEAT_FAST_S);
  });

  it("is a pulse, not a swell, and is re-read rarely enough to complete a beat", () => {
    const css = fs.readFileSync("app/globals.css", "utf8");
    const start = css.indexOf("@keyframes now-glow");
    const frames = css.slice(start, css.indexOf("\n}", start));
    // Two knocks then a pause — lub-dub — rather than one sine swell.
    expect(frames).toMatch(/12%/);
    expect(frames).toMatch(/36%/);
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    // Changing an animation's duration restarts it; at 60fps that is a
    // flicker rather than a heartbeat.
    expect(card).toMatch(/window\.setInterval\(tick, 2000\)/);
    expect(card).toMatch(/animationDuration: `\$\{beat\}s`/);
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
    const src = readFileSync("components/rest-timer.tsx", "utf8");
    expect(src).toMatch(/left: `\$\{\(lapPosition\(elapsed\) \/ 100\) \* pct\}%`/);
    expect(src).not.toMatch(/left: `\$\{lapPosition\(elapsed\)\}%`/);
  });
});
