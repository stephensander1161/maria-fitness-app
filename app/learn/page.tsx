import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises, facts } from "@/lib/db/schema";
import { Library } from "@/components/library";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const [moves, allFacts] = await Promise.all([
    db.select({
      slug: exercises.slug, name: exercises.name, category: exercises.category,
      primaryMuscles: exercises.primaryMuscles, equipment: exercises.equipment,
    }).from(exercises).orderBy(asc(exercises.name)),
    db.select({ id: facts.id, category: facts.category, text: facts.text, source: facts.source })
      .from(facts).orderBy(asc(facts.category)),
  ]);

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Learn</h1>
      <Library exercises={moves} facts={allFacts} />
    </>
  );
}
