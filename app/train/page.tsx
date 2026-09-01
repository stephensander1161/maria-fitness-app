import { TrainClient } from "@/components/train-client";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/session";
import { todayView } from "@/lib/views";

export const dynamic = "force-dynamic";

export default async function TrainPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
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
