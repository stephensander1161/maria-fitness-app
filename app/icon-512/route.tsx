import { ImageResponse } from "next/og";
import { BARBELL, BRAND_MARK, BRAND_TILE } from "@/lib/brand";

// Node, like everything else. The two icon routes were the only edge
// functions in the app — a second runtime for two PNGs, with its own cold
// starts and its own subset of Node.
export const runtime = "nodejs";

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
          alignItems: "center", justifyContent: "center",
          background: BRAND_TILE,
          borderRadius: 149,
        }}
      >
        <svg width="369" height="369" viewBox="0 0 48 48" fill="none">
          <g stroke={BRAND_MARK} strokeLinecap="round">
            <path d={BARBELL.bar.d} strokeWidth={BARBELL.bar.width} />
            <path d={BARBELL.plates.d} strokeWidth={BARBELL.plates.width} />
          </g>
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
