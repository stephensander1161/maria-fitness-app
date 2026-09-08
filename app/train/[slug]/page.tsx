import { TrainClient } from "@/components/train-client";
import { requireOnboarded } from "@/lib/session";
import { profileToday } from "@/lib/profile";
import { pickableExercises, todayView } from "@/lib/views";
import { todayTargets } from "@/lib/tools/progression-targets";
import { equipmentToday } from "@/lib/tools/phases";
import { prettyDate, weekStart } from "@/lib/date";
import { rollForward } from "@/lib/plan-rollover";

export const dynamic = "force-dynamic";

/**
 * One movement, on its own screen.
 *
 * The set entry used to be a sheet lifted over the day, and on a phone it was
 * unusable: focusing a field opens the keyboard, the keyboard resizes the
 * visual viewport, the sheet resizes with it, everything under the thumb
 * moves, and the tap lands on the scrim behind — so every value she tried to
 * enter closed the card, with no message and nothing to say why.
 *
 * A page has no scrim to land on, no focus trap, no pinned body, and the back
 * button and the swipe-back gesture both work. It carries the movement either
 * side of this one, so a session is worked through from here rather than by
 * going back to the list between every set.
 *
 * A wide screen still lifts the card where it sits — that is what the room is
 * for — so this is where a phone goes, not where everyone goes.
 */
export default async function MovementPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const profile = await requireOnboarded();
  const her = profileToday(profile);
  const { slug } = await params;
  const { d } = await searchParams;
  // The day this writes to, stated in the header for the same reason the
  // Train screen states it: a screen showing Thursday whose buttons write to
  // Wednesday is the most confusing thing this app could do.
  const on = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? (d as typeof her) : her;
  const isToday = on === her;

  await rollForward(profile.id, weekStart(on));

  const [view, pickable, targets] = await Promise.all([
    todayView(profile.id, profile.units, on),
    pickableExercises(equipmentToday(profile, her).equipment),
    todayTargets(profile.id, profile.units, her),
  ]);

  // No header of its own. The screen is one movement and the room at the top
  // of a phone is what decides whether the Log button is above the fold — a
  // page title, a day title and a back link is three lines saying two things.
  return (
    <TrainClient
      view={view}
      pickable={pickable}
      targets={targets}
      date={isToday ? undefined : on}
      isToday={isToday}
      focus={slug}
      dayLabel={isToday ? view.title : `${prettyDate(on)} · ${view.title}`}
    />
  );
}
