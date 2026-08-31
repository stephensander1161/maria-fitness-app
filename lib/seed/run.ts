/**
 * Idempotent content seed: exercises and facts are reference data, upserted by
 * slug so re-running after editing the libraries updates rows in place.
 * Run with: npm run db:seed
 */
import { db } from "@/lib/db";
import { exercises, facts } from "@/lib/db/schema";
import { EXERCISES } from "./exercises";
import { FACTS } from "./facts";

async function main() {
  for (const e of EXERCISES) {
    const row = {
      slug: e.slug, name: e.name, category: e.category,
      primaryMuscles: e.primaryMuscles, equipment: e.equipment,
      formCues: e.formCues, commonMistakes: e.commonMistakes,
      safetyNote: e.safetyNote ?? null,
      easierAlternatives: e.easier ?? [], harderAlternatives: e.harder ?? [],
      unilateral: e.unilateral ?? false, bodyweight: e.bodyweight ?? false,
    };
    await db.insert(exercises).values(row)
      .onConflictDoUpdate({ target: exercises.slug, set: row });
  }
  console.log(`✓ ${EXERCISES.length} exercises`);

  for (const f of FACTS) {
    const row = { slug: f.slug, category: f.category, text: f.text, source: f.source ?? null };
    await db.insert(facts).values(row).onConflictDoUpdate({ target: facts.slug, set: row });
  }
  console.log(`✓ ${FACTS.length} facts`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
