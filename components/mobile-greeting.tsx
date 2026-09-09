import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { titleStats } from "@/lib/views";
import { profileToday } from "@/lib/profile";
import { APP_TIMEZONE, greetingFor, hourIn } from "@/lib/date";
import { MobileMenu } from "./mobile-menu";

/**
 * Who she is, at the top of a phone screen.
 *
 * The desktop sidebar carries her name and her rank; a phone has no sidebar,
 * so both were simply invisible there — the rank in particular is a thing you
 * earn and never see, which is the same as not having one.
 *
 * Small and out of the way, and deliberately not sticky: it is a greeting, not
 * a control, and a bar that follows you down the page had better be doing
 * something for its keep.
 */
export async function MobileGreeting() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;

  const title = await titleStats(profile.id, profileToday(profile));
  // Her clock, not the server's — the same rule as every date in this app.
  const greeting = greetingFor(hourIn(profile.timezone ?? APP_TIMEZONE));
  const name = user.name ?? profile.name;

  return (
    <div className="mb-4 flex items-start justify-between gap-3 md:hidden">
      {/* Two lines, not one squeezed row. Sharing a row with the rank, the
          greeting truncated to "Good night, …" — cutting off the one word on
          this screen that is her own name. Stacked, both fit whole. */}
      <div className="min-w-0 flex-1">
        {/* The comma belongs to the greeting, not to the name — inside the
            bolder span it was a stray dark tick sitting against grey text. */}
        <p className="text-[13px] text-muted">
          {greeting}
          {name ? <>, <span className="font-semibold text-text">{name}</span></> : null}
        </p>
        <p
          className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-accent"
          title={title.blurb}
        >
          {title.name}
        </p>
      </div>
      <span className="sr-only">{title.blurb}</span>
      {/* The rest of the app. It used to be a row of pills at the end of every
          page — half the app below the fold on the device most people use. */}
      <MobileMenu isOwner={user.role === "owner"} recovering={profile.postpartumBirthDate !== null} />
    </div>
  );
}
