import { describe as suite, expect, it } from "vitest";
import { buildSystem } from "@/lib/agent/system";
import type { Profile } from "@/lib/db/schema";

/**
 * She picks how the coach talks. The point of the feature is that this changes
 * the register and nothing else — a blunt coach says "that was down on last
 * week, here's why", it does not say "no excuses". These tests hold that gap
 * open, because the tone that would be most fun to write is exactly the one
 * that could quietly turn into shame.
 */
const profile = (tone: Profile["coachTone"]): Profile => ({
  id: "p", userId: "u", name: "Her", birthYear: 1990, sex: "female",
  heightCm: 168, startWeightKg: 78, goalWeightKg: 66, goalDate: null,
  motivation: null, activityLevel: null, experience: "returning",
  daysPerWeek: 3, sessionMinutes: 45, equipment: [], injuries: [],
  dietaryRestrictions: [], dislikedFoods: [], cookingSkill: null,
  coachTone: tone, units: "metric", foodUnits: null, timezone: "UTC",
  dailyBudgetMicros: null, maintenanceUntil: null, tempEquipment: null,
  defaultRestSeconds: null, restByGroup: null, weighInReminderHour: null, weighInRemindedOn: null,
  shareCode: null,
  tempEquipmentUntil: null, planSetupAt: null, planSetupSkippedAt: null,
  onboardedAt: new Date(), createdAt: new Date(),
});

const personaFor = (tone: Profile["coachTone"]) => buildSystem(profile(tone))[0].text as string;
const TONES = ["encouraging", "plain", "hype"] as const;

suite("three voices", () => {
  it("gives each tone a different voice", () => {
    const voices = TONES.map(personaFor);
    expect(new Set(voices).size).toBe(3);
    expect(personaFor("hype")).toMatch(/gym-floor|blunt/i);
    expect(personaFor("encouraging")).toMatch(/warm/i);
  });

  it("keeps the voice in the cached half, so it stays cacheable", () => {
    const blocks = buildSystem(profile("hype"));
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    // And nothing volatile has crept in with it.
    expect(blocks[0].text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

suite("what no voice may change", () => {
  for (const tone of TONES) {
    it(`${tone} still carries the non-negotiables`, () => {
      const persona = personaFor(tone);
      // The rules that exist because getting them wrong hurts her.
      expect(persona, "it is her data").toMatch(/Never refuse, never argue/);
      expect(persona, "pain").toMatch(/Never tell her to push through/);
      expect(persona, "the scale").toMatch(/\*\*trend\*\*, not the last reading/i);
      expect(persona, "a stall in a deficit").toMatch(/the plan working, not her failing/);
      expect(persona, "adherence").toMatch(/never a compliance score/i);
    });

    it(`${tone} never licenses shaming her`, () => {
      const persona = personaFor(tone);
      // "No excuses" is the exact phrase that turns a blunt coach into a
      // punishing one, and it is the one a gym-bro voice reaches for first.
      const shaming = /\bno excuses\b|\blazy\b|\bsoft\b(?!ly)|\bpathetic\b|\bearn(ed)? (your|the) (food|carbs)\b/i;
      const voice = persona.slice(persona.indexOf("## Your voice"));
      // The hype voice may *name* those phrases in order to forbid them.
      const licences = voice.split("\n").filter((l) => shaming.test(l) && !/never|not a|no[t]? /i.test(l));
      expect(licences, `${tone}: ${licences.join(" | ")}`).toEqual([]);
    });
  }
});
