import { cache } from "react";
import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { coachNameOf, DEFAULT_COACH_NAME } from "@/lib/coach-name";

/** Her name for the coach, for this request — the same shape as currentTheme. */
export const currentCoachName = cache(async (): Promise<string> => {
  try {
    const user = await currentUser();
    if (!user) return DEFAULT_COACH_NAME;
    const profile = await getProfile(user.id);
    return coachNameOf(profile.coachName);
  } catch {
    return DEFAULT_COACH_NAME;
  }
});
