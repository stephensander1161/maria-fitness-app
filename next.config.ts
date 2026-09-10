import type { NextConfig } from "next";

/**
 * The app loads no third-party scripts, fonts, images, or APIs, so the policy
 * can be genuinely restrictive. `connect-src 'self'` is the important line:
 * even if something ever coaxed the model into emitting a malicious URL, the
 * browser has nowhere to send her data.
 *
 * script/style keep 'unsafe-inline' because Next inlines its hydration payload.
 * That is tolerable here only because nothing renders untrusted HTML — coach
 * output goes through components/rich-text.tsx, which builds React nodes and
 * never touches dangerouslySetInnerHTML.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Don't advertise the framework version to scanners.
  poweredByHeader: false,

  /*
    No `next/image` anywhere in this app, so the image optimizer is dead
    weight — and it is not cheap dead weight. Next traces `sharp` and its
    platform binaries into *every* server function, which was 28MB of the
    42MB each deployment ships, including a 9MB wasm32 fallback for an
    architecture nothing here runs on.

    Every deployment keeps its own copy of that for as long as it is
    retained, and this project ships several times a day: a hundred
    deployments of unused image tooling is what filled 75% of the free
    tier's 10GB of function storage. The icon routes draw with ImageResponse,
    which uses resvg rather than sharp, so nothing here loses anything.
  */
  images: { unoptimized: true },

  /*
    …and telling it not to optimize is not enough on its own: the tracer pulls
    sharp into every route regardless, including /privacy, which is a page of
    static text. So it is excluded by hand.

    Nothing here decodes or resizes an image on the server. A progress photo is
    resized in the browser before it is uploaded — that is why
    `add_progress_photo` is the one uiOnly tool — and lib/photos.ts only ever
    moves bytes. The icon routes draw with ImageResponse, which rasterises
    through resvg rather than sharp; tests/brand-icon.test.ts renders each of them
    and fails if that ever stops being true.
  */
  outputFileTracingExcludes: {
    "/**": ["node_modules/@img/**", "node_modules/sharp/**"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        // Never let a proxy or browser cache a personal API response.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
