import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * The gate. Everything is denied by default — new routes are protected the
 * moment they exist, without anyone remembering to add them to a list.
 *
 * Runs on the edge before any page or route handler, so an unauthenticated
 * request never reaches the database or the Anthropic API.
 */
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/login",
  // Crawlers must be able to read the disallow rule without being redirected,
  // and iOS fetches the manifest when adding to the home screen.
  "/robots.txt",
  "/manifest.webmanifest",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Fail closed. A missing secret must never mean "let everyone in".
    return new NextResponse("Server not configured", { status: 503 });
  }

  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret).then((ok) => {
    if (ok) return NextResponse.next();

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
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
