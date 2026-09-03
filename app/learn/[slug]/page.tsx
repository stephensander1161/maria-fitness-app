import Link from "next/link";
import { notFound } from "next/navigation";
import { MovementDetail } from "@/components/movement-detail";
import { movementView } from "@/lib/views";

export const dynamic = "force-dynamic";

/**
 * One movement as its own page. On a desktop the library shows this in its
 * right-hand pane instead — same component, so a change lands in both.
 */
export default async function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const move = await movementView(slug);
  if (!move) notFound();

  return (
    <>
      <Link href="/learn" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Library
      </Link>
      <MovementDetail move={move} />
    </>
  );
}
