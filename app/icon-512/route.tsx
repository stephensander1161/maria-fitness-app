import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * The home-screen icon, at the larger size, used for the splash screen and store-style listings.
 *
 * Rendered rather than committed as a binary so it cannot drift from the
 * app's own colours, and so there is no PNG in the repo for anyone to have to
 * regenerate by hand. The 512 route is the same mark at the larger size.
 */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center", background: "#0b0e13",
        }}
      >
        <svg width="352" height="352" viewBox="0 0 24 24" fill="none"
          stroke="#ff6a45" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
