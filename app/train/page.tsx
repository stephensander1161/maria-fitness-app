import { TrainClient } from "@/components/train-client";
import { requireOnboarded } from "@/lib/session";
import { todayView } from "@/lib/views";

export const dynamic = "force-dynamic";

export default async function TrainPage() {
  const profile = await requireOnboarded();
  const view = await todayView(profile.id, profile.units);

  return (
    <>
      <header className="mb-5">
        <p className="text-[13px] font-medium uppercase tracking-wide text-accent">{view.dayName}</p>
        <h1 className="text-2xl font-bold tracking-tight">{view.title}</h1>
        {view.focus && <p className="mt-1 text-sm text-muted">{view.focus}</p>}
      </header>
      <TrainClient view={view} equipment={profile.equipment} />
    </>
  );
}
