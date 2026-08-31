import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center", background: "#0b0e13",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke="#ff6a45" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" />
        </svg>
      </div>
    ),
    size,
  );
}
