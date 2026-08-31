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
