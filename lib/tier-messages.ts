/**
 * What the coach says when a door is shut — lib/tiers.ts names the doors.
 * In its own file so lib/tools can import it: the tier module reads the
 * accounts table, which no tool module may touch.
 */
export type Feature = "planner" | "kitchen" | "camera" | "estimator";

export const PRO_ONLY: Record<Feature, string> = {
  planner: "Writing a week from scratch is part of Sore Winner Pro. On the free plan I can set you up from a template — say the word — or you can go Pro in Settings.",
  kitchen: "The Kitchen — meal plans, the fridge and the shopping list — is part of Sore Winner Pro. Logging what you eat works here as always.",
  camera: "Reading a photo is part of Sore Winner Pro. Tell me what it is and I'll log it from that.",
  estimator: "Working out food that isn't in the library is part of Sore Winner Pro. Try a plainer name, or give me the numbers off the packet.",
};
