/**
 * Screens that show no app chrome — no tab bar, no sidebar, no coach bubble,
 * no "more" row.
 *
 * One list, because there were four. Every one of them had to be edited by
 * hand each time a screen was added, and twice one was missed: the sign-up
 * page shipped with a tab bar pointing at screens you cannot reach signed
 * out. A signed-out visitor should see the page and nothing else.
 */
export const CHROMELESS_PATHS = new Set([
  "/login",
  "/signup",
  "/welcome",
  // Legal pages are read signed out, by people deciding whether to sign up,
  // and by App Store review. Chrome there is a wall of dead links.
  "/privacy",
  "/terms",
]);

export const isChromeless = (path: string): boolean =>
  CHROMELESS_PATHS.has(path) || path === "/";
