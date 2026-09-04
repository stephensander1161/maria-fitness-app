import { cache } from "react";
import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { themeOf, type Theme } from "@/lib/theme";

/**
 * The theme to render this request in.
 *
 * Read on the server and stamped onto <html>, so the first paint is already
 * right. The alternative — a script that reads localStorage after load — is
 * how a light-mode user gets a black flash on every navigation, and this app
 * knows who she is before it sends a byte.
 *
 * `cache()` memoises it per request: the layout and the viewport both need it,
 * and they should not be two round trips.
 *
 * It never throws. A database blip must degrade to the default palette, not
 * take out the root layout — that would replace every route's error page with
 * Next's unstyled white one, which in a standalone PWA leaves no way back.
 */
export const currentTheme = cache(async (): Promise<Theme> => {
  try {
    const user = await currentUser();
    if (!user) return themeOf(null);
    const profile = await getProfile(user.id);
    return themeOf(profile.theme);
  } catch {
    return themeOf(null);
  }
});
