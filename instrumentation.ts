import type { Instrumentation } from "next";

/**
 * Next calls this for every unhandled error in a render, a route handler, a
 * server action or the proxy. The row is shaped by lib/errors.ts, which is
 * the privacy boundary: the request Next hands over includes its headers,
 * cookie and all, and none of that is kept.
 *
 * Imported lazily and only in the Node runtime, so nothing here runs at
 * build time or pulls the database into a bundle that cannot hold it. And
 * it must never throw: an error while recording an error would replace the
 * page's own error boundary with something worse.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError, shapeError } = await import("@/lib/errors");
    await recordError(shapeError(error, request, context));
  } catch (err) {
    console.error("[errors] failed to record", err);
  }
};
