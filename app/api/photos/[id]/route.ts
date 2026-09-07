import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { photoBytes } from "@/lib/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One progress photo, to the person it is of.
 *
 * The proxy has already required a session; this resolves it to a profile
 * and asks lib/photos.ts for the bytes *with that profile id in the query*.
 * There is no path here where an id alone is enough. A miss is a 404 whether
 * the photo does not exist or belongs to someone else — the two must not be
 * distinguishable, or the route becomes a way to count another person's
 * photos.
 *
 * `no-store` comes from next.config's rule for every /api path: a photograph
 * of her body is not something a shared cache may keep.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const profile = await getProfile(user.id);
  const { id } = await params;
  const found = await photoBytes(profile.id, id);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(found.body as BodyInit, {
    headers: { "Content-Type": found.contentType, "Cache-Control": "private, no-store" },
  });
}
