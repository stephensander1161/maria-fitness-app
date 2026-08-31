import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
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

      <Link href="/" className="mt-2 block rounded-xl border border-line bg-surface py-3.5 text-center text-[14px] text-muted">
        Ask your coach about this movement
      </Link>
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
