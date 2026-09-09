import { z } from "zod";

/**
 * A macro figure on its way into an integer column.
 *
 * Every calorie and gram in this schema is an `integer`, and the numbers come
 * from a model: "4.5 oz chicken, half a cup of quinoa and 76g of green beans"
 * came back as 45.3g of protein and 22.6g of carbohydrate, and Postgres
 * refused the insert. The tool threw, the coach told him there was "a
 * database issue on the server side", and nothing was saved.
 *
 * Rounding is the right answer rather than a wider column. A gram is already
 * finer than anyone can weigh a chicken breast to, the whole figure is an
 * estimate from a description in words, and a tenth of a gram of protein is
 * precision this app does not have and must not imply it has.
 *
 * It belongs in the schema, not at each call site, because there are a dozen
 * of those — the meal log, the planner's week, the recipe writer, the
 * corrections — and every one of them is fed by a model that will hand over a
 * decimal the moment the arithmetic produces one.
 */
export const wholeGrams = z.number().transform((n) => Math.round(n));

/**
 * The same, where the field may be left out.
 *
 * `.transform().optional()` and not `.optional().transform()`: the second
 * rounds a value that may be undefined, and in doing so makes the *key*
 * required in the inferred type. Callers that legitimately omit the field
 * stop compiling, which is a strange price to pay for rounding.
 */
export const wholeGramsOptional = z.number().transform((n) => Math.round(n)).optional();

/** The same, where null means "she said so, and the figure is not known". */
export const wholeGramsNullable = z.number().transform((n) => Math.round(n)).nullable().optional();
