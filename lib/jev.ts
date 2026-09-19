import { TypeSafeClient, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

/**
 * Jev — a decision, not a sentence.
 *
 * TypeSafe's System One model answers typed questions about a piece of
 * state: pick one of these labels, put this on a scale, yes or no — each
 * with a calibrated confidence. It cannot produce a value outside the
 * schema, it answers in well under a second, and it costs about a
 * ten-thousandth of a cent per decision. Nothing here speaks to her; that is
 * still the coach. This is for the places the app *decides* — which library
 * row a food is, whether a recipe line is one thing or three — where the
 * choice used to be a string heuristic or a whole language-model call.
 *
 * Every caller must work without it. `decide` returns null when there is
 * no key, on a timeout, or on any error, and the caller falls back to what
 * it did before — so a decision the model cannot make costs nothing but the
 * old behaviour. Answers are cached briefly by request, because the same
 * question about the same food comes up again within the minute.
 */
export const jevConfigured = (): boolean => Boolean(process.env.JEV_API_KEY);

let client: TypeSafeClient | null = null;
const cache = new Map<string, { at: number; result: unknown }>();
const CACHE_MS = 10 * 60 * 1000;

function jev(): TypeSafeClient | null {
  const apiKey = process.env.JEV_API_KEY;
  if (!apiKey) return null;
  // A decision that takes longer than a second is not one worth waiting for
  // in a lookup; the fallback is right there. No retries for the same reason.
  client ??= new TypeSafeClient({ apiKey, timeout: 1500, retry: { maxRetries: 0 } as never, defaultModel: process.env.JEV_MODEL || "jev-latest" });
  return client;
}

export async function decide<const Q extends Questions>(state: unknown, questions: Q): Promise<SystemOneResult<Q> | null> {
  const c = jev();
  if (!c) return null;
  const key = JSON.stringify([state, questions]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result as SystemOneResult<Q>;
  try {
    const result = await c.systemOne({ state: state as never, questions });
    cache.set(key, { at: Date.now(), result });
    if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
    return result;
  } catch (err) {
    console.warn("[jev] fell back:", err instanceof Error ? err.message.slice(0, 160) : err);
    return null;
  }
}
