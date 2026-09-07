import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * The gate. Everything is denied by default — new routes are protected the
 * moment they exist, without anyone remembering to add them to a list.
 *
 * Runs before any page or route handler, so an unauthenticated request never
 * reaches the database or the Anthropic API. It deliberately has no database
 * of its own: signature and expiry only, and lib/session.ts does the rest.
 */
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/login",
  // Sign-up is claiming an invitation, and the person claiming it has no
  // session yet. Neither path can add an address — see lib/signup.ts.
  "/signup",
  "/api/auth/signup",
  // Legal pages. Read by someone deciding whether to sign up, and by an app
  // store reviewer who has no account. They hold no data of hers.
  "/privacy",
  "/terms",
  // The OAuth round trip must reach these while signed out. They are the
  // only other doors, and both end in the same invite check.
  "/api/auth/google",
  "/api/auth/google/callback",
  // Crawlers must be able to read the disallow rule without being redirected,
  // and iOS fetches the manifest when adding to the home screen.
  "/robots.txt",
  "/manifest.webmanifest",
  // Icons are exact paths, never prefixes — a lookahead like `icon` in the
  // matcher would also have let /iconoclast through.
  "/icon",
  "/icon-192",
  "/icon-512",
  "/apple-icon",
  "/favicon.ico",
  // The service worker script. It has to be reachable without a session or
  // its update check gets an HTML redirect instead of JavaScript and the
  // browser drops the registration. It contains no data of hers and caches
  // only content-hashed build assets — see public/sw.js.
  "/sw.js",
  // Scheduled jobs. Vercel's scheduler has no session, so the gate has to let
  // these through — and each route is its own guard: it refuses without a
  // CRON_SECRET and refuses a caller who does not present it. Listed exactly,
  // never as a prefix, and tests/invariants.test.ts checks that every path
  // under app/api/cron carries that guard. Neither reached its handler before
  // this: the gate answered 401 first, and the reminder never sent.
  "/api/cron/reminders",
  "/api/cron/backup",
]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Fail closed. A missing secret must never mean "let everyone in".
    return new NextResponse("Server not configured", { status: 503 });
  }

  // Signature and expiry only. Whether the account still exists, is enabled,
  // and has not been signed out everywhere is checked in lib/session.ts,
  // where the database is reachable.
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret).then((session) => {
    if (session) return NextResponse.next();

    // APIs get a status code; pages get redirected to the login screen.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  });
}

export const config = {
  // Everything except Next's own static output and the icon.
  // Only Next's own immutable build output is skipped, and only with the
  // trailing slash so /_next/staticfoo is still gated. Everything else runs
  // through here and is matched against PUBLIC_PATHS exactly.
  matcher: ["/((?!_next/static/|_next/image/).*)"],
};
