/**
 * Server-only environment access. Fails loudly at first use rather than
 * silently producing `undefined` deep inside a request.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Add it to .env (see .env.example).`,
    );
  }
  return value;
}

/** Integrations the app works without. Empty string counts as unset. */
function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

/**
 * Which database the process should use.
 *
 * `next dev` was pointing at production. Every probe, every half-finished
 * migration, every "let me just try that" landed in the same rows real people
 * read — and did: a seed overwrote the owner's profile, and a wrong-password
 * probe raised an alert on the live admin console. So the dev server prefers
 * DATABASE_URL_DEV (a Neon branch of production; see README), and says so
 * out loud when it has to fall back.
 *
 * Only the dev server. Scripts run with NODE_ENV unset and mean production:
 * `npm run requests` reads the real feedback table, `npm run user` grants
 * real roles, `npm run backup` backs up the real data. And production never
 * looks at the dev variable at all, whatever is set.
 */
export function databaseUrlFor(input: {
  nodeEnv: string | undefined;
  url: string | undefined;
  devUrl: string | undefined;
}): { url: string | undefined; warning: string | null } {
  if (input.nodeEnv !== "development") return { url: input.url, warning: null };
  if (input.devUrl) return { url: input.devUrl, warning: null };
  return {
    url: input.url,
    warning:
      "[db] The dev server is using DATABASE_URL — the production database. " +
      "Everything you do here lands in real rows. Set DATABASE_URL_DEV to a Neon branch (see README).",
  };
}

let warned = false;

export const env = {
  get DATABASE_URL() {
    const chosen = databaseUrlFor({
      nodeEnv: process.env.NODE_ENV,
      url: process.env.DATABASE_URL,
      devUrl: process.env.DATABASE_URL_DEV,
    });
    if (chosen.warning && !warned) {
      warned = true;
      console.warn(chosen.warning);
    }
    if (!chosen.url) required("DATABASE_URL");
    return chosen.url!;
  },
  get ANTHROPIC_API_KEY() {
    return required("ANTHROPIC_API_KEY");
  },
  /** Instacart Developer Platform key. Without it the shopping list still
   *  works; only the "send to Instacart" path is unavailable. */
  get INSTACART_API_KEY() {
    return optional("INSTACART_API_KEY");
  },
  /** "development" points at Instacart's sandbox host, which is where a key
   *  works before the app is approved for production. */
  get INSTACART_ENV() {
    return optional("INSTACART_ENV") === "development" ? "development" : "production";
  },
  /** Public origin of this deployment, for links that lead back here from a
   *  third party. Falls back to what Vercel knows about itself. */
  get APP_URL() {
    const explicit = optional("APP_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = optional("VERCEL_PROJECT_PRODUCTION_URL");
    return vercel ? `https://${vercel}` : undefined;
  },
};
