import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ExerciseFigure } from "@/components/exercise-figure";
import { AskCoach } from "@/components/ask-coach";
import { exercises } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [ex] = await db.select().from(exercises).where(eq(exercises.slug, slug)).limit(1);
  if (!ex) notFound();

  const relatedSlugs = [...ex.easierAlternatives, ...ex.harderAlternatives];
  const related = relatedSlugs.length
    ? await db.select({ slug: exercises.slug, name: exercises.name })
        .from(exercises).where(inArray(exercises.slug, relatedSlugs))
    : [];
  const nameOf = (s: string) => related.find((r) => r.slug === s)?.name ?? s;

  return (
    <>
      <Link href="/learn" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Library
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{ex.name}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {ex.primaryMuscles.join(" · ")}
          {ex.equipment.length > 0 && <span className="text-faint"> — {ex.equipment.join(", ")}</span>}
        </p>
      </header>

      <div className="card mb-4 flex justify-center py-5">
        <ExerciseFigure slug={ex.slug} category={ex.category} className="h-40 w-40 text-accent" />
      </div>

      {ex.safetyNote && (
        <div className="mb-4 rounded-xl border border-hold/30 bg-hold-soft p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-hold">Worth knowing</p>
          <p className="text-[14px] leading-relaxed text-text">{ex.safetyNote}</p>
        </div>
      )}

      <Section title="How to do it">
        <ol className="space-y-3">
          {ex.formCues.map((cue, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent tabular">
                {i + 1}
              </span>
              <span className="text-[14px] leading-relaxed">{cue}</span>
            </li>
          ))}
        </ol>
      </Section>

      {ex.commonMistakes.length > 0 && (
        <Section title="Common mistakes">
          <ul className="space-y-2.5">
            {ex.commonMistakes.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-miss" />
                <span className="text-[14px] leading-relaxed text-muted">{m}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(ex.easierAlternatives.length > 0 || ex.harderAlternatives.length > 0) && (
        <Section title="Scale it">
          <div className="space-y-3">
            {ex.easierAlternatives.length > 0 && (
              <Alternatives label="Easier" slugs={ex.easierAlternatives} nameOf={nameOf} />
            )}
            {ex.harderAlternatives.length > 0 && (
              <Alternatives label="Harder" slugs={ex.harderAlternatives} nameOf={nameOf} />
            )}
          </div>
        </Section>
      )}

      {/* Right here, not on the Coach tab — leaving the page to ask about it
          means arriving at a chat without the thing you were reading. */}
      <AskCoach
        title={`Ask your coach about the ${ex.name.toLowerCase()}`}
        hint="Saved to your conversation"
        placeholder={`Ask about the ${ex.name.toLowerCase()}…`}
        suggestions={[
          `How do I know I'm doing the ${ex.name.toLowerCase()} right?`,
          `Should I be doing the ${ex.name.toLowerCase()}?`,
          `Add the ${ex.name.toLowerCase()} to my plan`,
          "What weight should I start with?",
        ]}
      />
    </>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card mb-3 p-5">
    <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
    {children}
  </section>
);

const Alternatives = ({
  label, slugs, nameOf,
}: { label: string; slugs: string[]; nameOf: (s: string) => string }) => (
  <div>
    <p className="mb-1.5 text-[11px] uppercase tracking-wide text-faint">{label}</p>
    <div className="flex flex-wrap gap-2">
      {slugs.map((s) => (
        <Link key={s} href={`/learn/${s}`}
          className="rounded-full border border-line bg-raised px-3 py-1.5 text-[13px] text-muted">
          {nameOf(s)}
        </Link>
      ))}
    </div>
  </div>
);
