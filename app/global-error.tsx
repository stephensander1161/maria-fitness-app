"use client";

/**
 * The layout itself failed, so there is no chrome to fall back on — this
 * replaces `<html>`. Deliberately styleless beyond the essentials: whatever
 * broke may well be the stylesheet.
 */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{
        background: "#0b0e13", color: "#e9eef4", margin: 0, minHeight: "100dvh",
        display: "grid", placeItems: "center", textAlign: "center",
        fontFamily: "-apple-system, system-ui, sans-serif", padding: "2rem",
      }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 600 }}>The app didn&rsquo;t start</h1>
          <p style={{ color: "#8b98a8", fontSize: 14, maxWidth: 320, margin: "0.5rem auto 0" }}>
            Nothing you&rsquo;ve logged is affected. {error.digest ? `Reference ${error.digest}.` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20, background: "#ff6a45", color: "#05070a", border: 0,
              borderRadius: 999, padding: "10px 20px", fontSize: 14, fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
