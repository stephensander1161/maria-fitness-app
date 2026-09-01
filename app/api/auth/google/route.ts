import { cookies } from "next/headers";
import { authorizeUrl, beginFlow, googleConfigured } from "@/lib/oauth";

export const runtime = "nodejs";

/** Short-lived and httpOnly: it only has to survive the round trip to Google. */
const FLOW_COOKIE = "coach_oauth";

export async function GET(req: Request) {
  if (!googleConfigured()) {
    return Response.redirect(new URL("/login?error=google_unavailable", req.url), 302);
  }

  const pending = beginFlow();
  const store = await cookies();
  store.set(FLOW_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // The callback is a top-level navigation back from Google, which `strict`
    // would strip the cookie from — taking the state check with it.
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return Response.redirect(authorizeUrl(req, pending), 302);
}
