import Link from "next/link";
import { notFound } from "next/navigation";
import { MovementDetail } from "@/components/movement-detail";
import { movementView } from "@/lib/views";
import { backTo } from "@/lib/back-to";

export const dynamic = "force-dynamic";

/**
 * One movement as its own page. On a desktop the library shows this in its
 * right-hand pane instead — same component, so a change lands in both.
 *
 * `?from=` says where she was, because this page is reached from the day's
 * warm-up and cool-down as well as from the library, and sending her back to
 * the library after a tap on the Train screen loses her place. It is a
 * redirect target read out of a query string, so `backTo` validates it against
 * an allowlist rather than trusting it.
 */
export default async function ExercisePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const move = await movementView(slug);
  if (!move) notFound();

  const back = backTo((await searchParams).from);

  return (
    <>
      <Link href={back.href} className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        {back.label}
      </Link>
      <MovementDetail move={move} />
    </>
  );
}
