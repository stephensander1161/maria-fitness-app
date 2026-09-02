import { redirect } from "next/navigation";

/**
 * Home is today's session. The coach used to live here, back when it was a
 * tab; it is a bubble on every screen now, so "/" would otherwise be a page
 * with nothing on it.
 *
 * A redirect rather than a second copy of the training screen: one
 * implementation, and sign-in and onboarding can keep sending her to "/".
 */
export default function Home() {
  redirect("/train");
}
