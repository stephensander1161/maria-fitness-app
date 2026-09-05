import { ImageResponse } from "next/og";
import { BARBELL, BRAND_ACCENT, BRAND_ACCENT_FADED, BRAND_INK } from "@/lib/brand";

// iOS uses this when she adds the app to her home screen. Generated rather
// than committed as a binary so the mark stays editable in one place.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center",
          background: `linear-gradient(135deg, ${BRAND_ACCENT} 0%, ${BRAND_ACCENT_FADED} 100%)`,
          borderRadius: 52,
        }}
      >
        <svg width="130" height="130" viewBox="0 0 48 48" fill="none">
          <g stroke={BRAND_INK} strokeLinecap="round">
            <path d={BARBELL.bar.d} strokeWidth={BARBELL.bar.width} />
            <path d={BARBELL.plates.d} strokeWidth={BARBELL.plates.width} />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
