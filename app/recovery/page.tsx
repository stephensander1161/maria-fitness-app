import Link from "next/link";
import { requireOnboarded } from "@/lib/session";
import { runTool } from "@/lib/tools";
import { AskCoach } from "@/components/ask-coach";
import { RecoveryStatus } from "@/components/recovery-status";
import { db } from "@/lib/db";
import { exercises } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Plan = {
  postpartum: boolean;
  stage?: "early" | "foundation" | "building";
  summary?: string;
  cleared?: boolean;
  checkOverdue?: boolean;
  focus?: { work: string; movements: string[] };
  avoid?: { what: string; why: string }[];
  impact?: { ready: boolean; because: string };
  symptoms?: { symptom: string; means: string; do: string }[];
  seePhysio?: boolean;
  energy?: string | null;
  nonNegotiable?: string;
};

const STAGE_NAME: Record<string, string> = {
  early: "Early days",
  foundation: "Foundation",
  building: "Building",
};

/**
 * Coming back from childbirth.
 *
 * Its own screen, because this is not a variation on a training plan — for a
 * while it *is* the training plan, and burying it inside Train would make the
 * work look like a lesser version of the real thing. It is not: after late
 * pregnancy and birth a walk sits at a real percentage of capacity, which is
 * the definition of a training stimulus.
 *
 * Everything shown here comes from lib/postpartum.ts through the tool, so the
 * screen and the coach cannot drift into giving different advice.
 */
export default async function RecoveryPage() {
  const profile = await requireOnboarded();
  const plan = (await runTool("get_postpartum_plan", {}, { profileId: profile.id })) as Plan;

  const movements = plan.focus?.movements ?? [];
  const rows = movements.length
    ? await db.select({ slug: exercises.slug, name: exercises.name })
        .from(exercises).where(inArray(exercises.slug, movements))
    : [];
  const byslug = new Map(rows.map((r) => [r.slug, r.name]));

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Recovery</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Coming back from childbirth, at the pace your body is actually on.
        </p>
      </header>

      <div className="max-w-xl lg:max-w-5xl">
        {!plan.postpartum ? (
          // An empty state, not a missing card: someone who arrives here
          // should learn what it is for and how to turn it on.
          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">Not set up</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              If you have given birth in the last couple of years, telling the app changes
              which movements it puts in your plan and which it leaves out. You can say it to
              your coach in a sentence — &ldquo;I had a baby four months ago&rdquo; — or set it
              in <Link href="/settings" className="underline underline-offset-2">Settings</Link>.
            </p>
            <div className="mt-4"><RecoveryStatus /></div>
          </section>
        ) : (
          <div className="space-y-3">
            {plan.seePhysio && (
              // First, and impossible to scroll past. This is the one thing on
              // the screen that is time-sensitive.
              <section className="card border-miss/50 p-5">
                <h2 className="text-[15px] font-semibold text-miss">See a pelvic health physiotherapist</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-text">
                  You have reported something that should be assessed rather than trained
                  around. That is not a setback — supervised pelvic floor training is the
                  first-line treatment and it works.
                </p>
                <ul className="mt-3 space-y-2">
                  {plan.symptoms?.map((s) => (
                    <li key={s.symptom} className="border-t border-line/60 pt-2 first:border-0 first:pt-0">
                      <p className="text-[13px] font-medium">{s.means}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{s.do}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold">{STAGE_NAME[plan.stage ?? ""] ?? "Where you are"}</h2>
                <span className="text-[11px] uppercase tracking-widest text-faint">
                  {plan.cleared ? "cleared for exercise" : "not cleared yet"}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{plan.focus?.work}</p>

              {!plan.cleared && (
                <p className="mt-3 rounded-xl border border-hold/40 bg-hold-soft px-4 py-3 text-[13px] leading-relaxed text-hold">
                  {plan.checkOverdue
                    ? "You are past the usual point for the postnatal check. Until someone has looked at you, this app will not write you a training programme — walking and breathing are the work, and they count."
                    : "Until a clinician has checked you, this app will not write you a training programme. Walking and breathing are the work, and after late pregnancy they are a real training stimulus rather than a consolation prize."}
                </p>
              )}
            </section>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="card p-5">
                <h2 className="text-[15px] font-semibold">What to work on</h2>
                <ul className="mt-3 space-y-1.5">
                  {movements.map((slug) => (
                    <li key={slug}>
                      <Link
                        href={`/learn/${slug}`}
                        className="flex items-baseline justify-between gap-3 text-[14px] hover:text-accent"
                      >
                        <span>{byslug.get(slug) ?? slug}</span>
                        <span className="shrink-0 text-[12px] text-faint">how to</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card p-5">
                <h2 className="text-[15px] font-semibold">Leave these for now</h2>
                <ul className="mt-3 space-y-2.5">
                  {plan.avoid?.map((a, i) => (
                    <li key={i} className="border-t border-line/60 pt-2.5 first:border-0 first:pt-0">
                      <p className="text-[13px] font-medium">{a.what}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{a.why}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="card p-5">
              <h2 className="text-[15px] font-semibold">Running and impact</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {plan.impact?.ready ? "Ready when you are. " : ""}{plan.impact?.because}
              </p>
            </section>

            {plan.energy && (
              <section className="card p-5">
                <h2 className="text-[15px] font-semibold">Eating while feeding</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{plan.energy}</p>
              </section>
            )}

            <section className="card p-5">
              <h2 className="text-[15px] font-semibold">Where you are</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{plan.summary}</p>
              <div className="mt-4"><RecoveryStatus /></div>
            </section>

            <p className="px-1 pt-1 text-[12px] leading-relaxed text-faint">{plan.nonNegotiable}</p>
          </div>
        )}

        <div className="mt-6">
          <AskCoach
            title="Ask about recovery"
            hint="Your coach knows where you are and what is safe right now."
            suggestions={[
              "What should I be doing this week?",
              "When can I start running again?",
              "I leak when I sneeze — what do I do?",
            ]}
            placeholder="Ask anything about coming back…"
          />
        </div>
      </div>
    </>
  );
}
