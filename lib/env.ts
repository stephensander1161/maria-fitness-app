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

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
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
