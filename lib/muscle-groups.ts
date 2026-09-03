/**
 * The library names about fifty muscles; a person looking for an exercise
 * thinks in about eight.
 *
 * One mapping, shared by the weekly volume ledger and the movement library, so
 * "Back" means the same thing in both places. The library also needs every
 * exercise to land *somewhere* — an unfiled movement is invisible in a grouped
 * list — so `groupForExercise` falls back to the category, where the volume
 * ledger deliberately drops what no landmark describes.
 */

export const MUSCLE_GROUPS = [
  "Legs", "Glutes", "Back", "Chest", "Shoulders", "Arms", "Core",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** Everything a movement can be filed under in the library. */
export type LibraryGroup = MuscleGroup | "Conditioning" | "Mobility";

const MEMBERS: Record<MuscleGroup, string[]> = {
  // Glutes are their own group here and part of Legs in the volume ledger:
  // for finding an exercise, "glutes" is what she searches for.
  Glutes: ["glutes", "hips", "hip abductors"],
  Legs: ["quads", "hamstrings", "calves", "adductors", "legs", "soleus", "gastrocnemius", "hip flexors"],
  Back: ["upper back", "lats", "back", "rhomboids", "mid traps", "upper traps", "lower back", "thoracic spine", "spine"],
  Chest: ["chest"],
  Shoulders: ["shoulders", "rear delts", "rear shoulder", "shoulder", "rotator cuff", "posterior shoulder capsule", "levator scapulae"],
  Arms: ["biceps", "triceps", "forearm", "forearms", "grip", "wrist", "elbow"],
  Core: ["core", "deep core", "obliques", "transverse abdominis", "pelvic floor", "diaphragm"],
};

const LOOKUP = new Map<string, MuscleGroup>();
for (const group of MUSCLE_GROUPS) {
  for (const m of MEMBERS[group]) LOOKUP.set(m, group);
}

/** Null for anything no group describes — neck work, conditioning, balance. */
export const groupForMuscle = (muscle: string): MuscleGroup | null =>
  LOOKUP.get(muscle.trim().toLowerCase()) ?? null;

/**
 * Where a movement belongs in the library. Its first primary muscle wins, so
 * a Romanian deadlift files under the thing it is *for* rather than the
 * longest list of things it touches.
 */
export function groupForExercise(ex: { primaryMuscles: string[]; category: string }): LibraryGroup {
  for (const m of ex.primaryMuscles) {
    const group = groupForMuscle(m);
    if (group) return group;
  }
  return ex.category === "mobility" ? "Mobility" : "Conditioning";
}

/** Reading order: the big groups first, then the ones you go looking for. */
export const LIBRARY_GROUP_ORDER: LibraryGroup[] = [
  "Legs", "Glutes", "Back", "Chest", "Shoulders", "Arms", "Core", "Conditioning", "Mobility",
];
