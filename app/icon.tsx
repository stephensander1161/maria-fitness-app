import { ImageResponse } from "next/og";
import { BARBELL, BRAND_MARK, BRAND_TILE } from "@/lib/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center",
          background: BRAND_TILE,
          borderRadius: 19,
        }}
      >
        <svg width="46" height="46" viewBox="0 0 48 48" fill="none">
          <g stroke={BRAND_MARK} strokeLinecap="round">
            <path d={BARBELL.bar.d} strokeWidth={BARBELL.bar.width} />
            <path d={BARBELL.plates.d} strokeWidth={BARBELL.plates.width} />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
