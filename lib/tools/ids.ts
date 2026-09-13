import { z } from "zod";

/**
 * A row id handed over by the model.
 *
 * Every one of these ends up in `eq(table.id, …)` against a `uuid` column, and
 * Postgres does not shrug at a value that is not one — it raises, the tool
 * throws, and the turn comes back as a failure the coach reports to her as a
 * server problem. That is what happened: asked to correct her breakfast an
 * hour after logging it, the model no longer had the id, invented
 * `"breakfast-smoothie"`, and the correction died in the driver. She read out
 * the figures off six packets and not one of them was ever written down.
 *
 * Validating at the boundary turns that into a sentence the model can act on —
 * `runTool` hands a rejected input straight back as `Invalid arguments` — and
 * the message says where a real id comes from, because "invalid uuid" tells it
 * nothing it can use.
 *
 * It does not make an id *hers*: every query still scopes to her profile. This
 * only stops a made-up one becoming an exception instead of an answer.
 */
export const herId = (from: string) =>
  z.string().uuid(`not an id — get one from ${from}, or use the lookup that needs no id`);
