/**
 * Body measurement sites. Each carries how to take it consistently — most
 * measurement "progress" is really tape placement drifting week to week, so
 * the guidance is part of the feature, not decoration.
 */
export const SITES = [
  {
    key: "waist",
    label: "Waist",
    /** Shown first and treated as the headline: it tracks visceral fat, the
     *  kind that actually matters for health, better than weight does. */
    primary: true,
    how: "At the narrowest point, usually just above the navel. Stand relaxed, tape snug but not squeezing, and measure at the end of a normal breath out — not sucked in.",
  },
  {
    key: "hips",
    label: "Hips",
    how: "Around the widest part of your glutes, feet together. Keep the tape level all the way round — check the back in a mirror.",
  },
  {
    key: "chest",
    label: "Chest",
    how: "Around the fullest part, tape under the armpits and level across the back. Arms relaxed at your sides, at the end of a breath out.",
  },
  {
    key: "thigh",
    label: "Thigh",
    how: "Halfway between hip and knee on the same leg every time. Stand with weight even on both feet.",
  },
  {
    key: "arm",
    label: "Arm",
    how: "Midway between shoulder and elbow, same arm every time, relaxed and hanging down.",
  },
  {
    key: "neck",
    label: "Neck",
    how: "Just below the Adam's apple, tape level and light. Don't tense.",
  },
  {
    key: "calf",
    label: "Calf",
    how: "Around the widest part, standing with weight on both feet.",
  },
] as const;

export type SiteKey = (typeof SITES)[number]["key"];

export const SITE_KEYS = SITES.map((s) => s.key) as unknown as [SiteKey, ...SiteKey[]];

export const siteLabel = (key: string) => SITES.find((s) => s.key === key)?.label ?? key;
export const siteHow = (key: string) => SITES.find((s) => s.key === key)?.how ?? "";

/** Take them at the same time of day, ideally first thing, once a week. */
export const MEASURING_ADVICE =
  "Measure first thing in the morning, before eating, same day each week. Day-to-day changes are mostly food and water — it's the month that tells you anything.";
