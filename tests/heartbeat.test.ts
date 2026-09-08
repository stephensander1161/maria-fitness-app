import { describe as suite, expect, it } from "vitest";
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
