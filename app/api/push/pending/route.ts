import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { getProfile } from "@/lib/profile";
import { currentUser } from "@/lib/session";
import { today } from "@/lib/date";

export const runtime = "nodejs";

/**
 * What the notification should say, asked for at the moment it arrives.
 *
 * The push itself still carries nothing — that property is the whole reason
 * this app's privacy policy can say what it says, and it has not changed. The
 * service worker wakes, asks the app what this one is about over its own
 * session, and shows the answer. Apple's and Google's push services still see
 * an empty envelope.
 *
 * A fetch that fails falls back to the weigh-in wording in the worker, which
 * is the one notification this app sent for its whole life so far.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "owner") {
    // Somebody is out of coach allowance and has asked for more. The owner is
    // the only person who can answer, and until they do that person's coach
    // is switched off — which is a thing worth a notification rather than a
    // thing to discover on the console tomorrow.
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
      .from(profiles)
      .where(and(isNotNull(profiles.topUpRequestedOn), eq(profiles.topUpRequestedOn, today())));
    if (n > 0) {
      return Response.json({
        title: n === 1 ? "Someone wants more coach" : `${n} people want more coach`,
        body: "They have run out for today. One tap on the console gives them more.",
        url: "/admin",
        tag: "coach-top-up",
      });
    }
  }

  const profile = await getProfile(user.id);
  return Response.json({
    title: "Time to weigh in",
    body: "Ten seconds on the scale. No single reading is judged.",
    url: "/progress",
    tag: "coach-weigh-in",
    // Unused by the worker; here so the shape is obviously per-person.
    for: profile.id.slice(0, 8),
  });
}
