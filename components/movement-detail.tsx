import Link from "next/link";
import type { MovementView } from "@/lib/views";
import { ExerciseFigure } from "@/components/exercise-figure";
import { AskCoach } from "@/components/ask-coach";

/**
 * One movement, rendered either as its own page on a phone or as the right
 * pane of the library on a desktop. Same component, so the two cannot drift.
 */
export function MovementDetail({ move, pane }: { move: MovementView; pane?: boolean }) {
  const ex = move;
  // In a pane the list is right there, so links stay in the pane; as a page
  // they navigate.
  const href = (s: string) => (pane ? `/learn?m=${s}` : `/learn/${s}`);

  return (
    <>
      <header className="mb-4">
        <h1 className={pane ? "text-xl font-bold tracking-tight" : "text-2xl font-bold tracking-tight"}>
          {ex.name}
        </h1>
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
        {ex.formCues.length === 0 ? (
          <p className="text-[13px] text-muted">
            No cues written for this one yet — ask your coach and it&rsquo;ll talk you through it.
          </p>
        ) : (
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
        )}
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

      {(ex.easier.length > 0 || ex.harder.length > 0) && (
        <Section title="Scale it">
          <div className="space-y-3">
            {ex.easier.length > 0 && <Alternatives label="Easier" moves={ex.easier} href={href} />}
            {ex.harder.length > 0 && <Alternatives label="Harder" moves={ex.harder} href={href} />}
          </div>
        </Section>
      )}

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
  label, moves, href,
}: { label: string; moves: { slug: string; name: string }[]; href: (s: string) => string }) => (
  <div>
    <p className="mb-1.5 text-[11px] uppercase tracking-wide text-faint">{label}</p>
    <div className="flex flex-wrap gap-2">
      {moves.map((m) => (
        <Link key={m.slug} href={href(m.slug)}
          className="rounded-full border border-line bg-raised px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-accent/50 hover:text-accent">
          {m.name}
        </Link>
      ))}
    </div>
  </div>
);
