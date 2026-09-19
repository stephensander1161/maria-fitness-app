import { choice } from "@typesafe-ai/sdk";
import { decide } from "@/lib/jev";

/**
 * Which library row she means — decided, not scored.
 *
 * `searchFoods` ranks rows by where the words fall in the name, which is
 * how "pieces pizza" found nothing and "cup" once found a food. The match
 * is a decision about meaning, so it is asked as one: here are the five
 * closest rows, is one of them the same food as what she typed, or none?
 * "None" is a real answer — a different food that merely shares a word is
 * none — and it is what sends the lookup to the estimator on purpose rather
 * than to the wrong row.
 *
 * Confidence-gated, and unsure means nothing changes: the old ranking wins.
 */
export type Candidate = { slug: string; name: string; category: string; unitLabel?: string | null };

export type Verdict<T> = { kind: "row"; row: T; confidence: number } | { kind: "none"; confidence: number } | { kind: "unsure" };

/** Below this the model's answer is not trusted over the ranking. */
export const MATCH_CONFIDENCE = 0.6;

export function pickMatch<T extends Candidate>(
  answer: { choice: string; confidence: number } | null,
  candidates: T[],
): Verdict<T> {
  if (!answer || answer.confidence < MATCH_CONFIDENCE) return { kind: "unsure" };
  if (answer.choice === "none") return { kind: "none", confidence: answer.confidence };
  const row = candidates.find((c) => c.slug === answer.choice);
  return row ? { kind: "row", row, confidence: answer.confidence } : { kind: "unsure" };
}

export async function chooseFood<T extends Candidate>(query: string, candidates: T[]): Promise<Verdict<T>> {
  if (candidates.length === 0) return { kind: "unsure" };
  const criteria: Record<string, string> = { none: "None of these is the same food as what she typed — a different food that merely shares a word is none" };
  for (const c of candidates) {
    criteria[c.slug] = `${c.name} (${c.category}${c.unitLabel ? `, sold per ${c.unitLabel}` : ""})`;
  }
  const result = await decide(
    { typed: query },
    { food: choice("Which of these library foods is the one she typed? The wording may be casual, plural, or a brand-less name for the same thing.", criteria) },
  );
  return pickMatch(result?.answers.food ?? null, candidates);
}
