/**
 * What she calls her coach.
 *
 * "Coach" unless she says otherwise — asked once at onboarding, changeable in
 * Settings or by asking. The name is hers to pick, so the app only keeps it
 * short and printable: a name is a word or two, and a control character in
 * one would only ever be an accident or an attack.
 */
export const DEFAULT_COACH_NAME = "Coach";
export const COACH_NAME_MAX = 24;

export function coachNameOf(raw: string | null | undefined): string {
  const clean = (raw ?? "")
    // Escape sequences first, then every other control character.
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, COACH_NAME_MAX)
    .trim();
  return clean || DEFAULT_COACH_NAME;
}

/** "Coach's", "James'". */
export const possessive = (name: string): string =>
  /s$/i.test(name) ? `${name}'` : `${name}'s`;
