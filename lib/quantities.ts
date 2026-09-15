/**
 * How people write "two of them".
 *
 * `parsePortion` only ever understood a leading digit, so "2x pork chops" was
 * read correctly and "two pork chops", "pork chops x2", "a couple of eggs" and
 * "½ cup rice" were all read as *one hundred grams of a food with a number in
 * its name* — a wrong calorie figure presented with total confidence, which is
 * the exact failure lib/portion.ts exists to prevent.
 *
 * His words: "i see i add 2x so it needs to be smart enough to know the
 * difference between pork chop and if i write '2x pork chops' for example and
 * other quantity nomenclature too."
 *
 * So this normalises the wording *before* the parse and does nothing else:
 * every form below comes out as a leading decimal and the parser downstream is
 * unchanged. Pure, and tested one phrasing at a time, because a portion this
 * gets wrong is never reported as an error — it is reported as a number.
 */

/** Written-out numbers, as far as anybody writes them out. */
const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  dozen: 12, couple: 2, few: 3, several: 3, half: 0.5, quarter: 0.25,
};

/** The fraction glyphs a phone keyboard will happily produce. */
const GLYPHS: Record<string, string> = {
  "½": "0.5", "⅓": "0.333", "⅔": "0.667", "¼": "0.25", "¾": "0.75",
  "⅕": "0.2", "⅖": "0.4", "⅗": "0.6", "⅘": "0.8", "⅙": "0.167", "⅛": "0.125",
};

/** 2.500 reads as 2.5 and 2.000 as 2. */
const tidy = (n: number): string => String(Math.round(n * 1000) / 1000);

export function normaliseQuantity(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return "";

  // The multiplication sign and its lookalikes are an x. A phone keyboard
  // offers × where the parser only ever accepted the letter.
  s = s.replace(/[×✕✖⨯]/g, "x");

  // Fraction glyphs first, then "1 1/2" and "1/2".
  s = s.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅛]/g, (g) => ` ${GLYPHS[g]} `);
  s = s.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (_, w, n, d) =>
    tidy(Number(w) + Number(n) / Number(d)));
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g, (_, n, d) => tidy(Number(n) / Number(d)));
  s = s.replace(/\s+/g, " ").trim();

  /*
    "pork chops x2", "pork chops (x2)" — the count at the end, which is how a
    receipt writes it and how about half the people typing a meal do.

    Only when something comes before it: a bare "x2" names no food at all.
  */
  const trailing = s.match(/^(.*?)[\s(]*\bx\s*(\d+(?:\.\d+)?)\)?$/);
  if (trailing?.[1]?.trim()) s = `${trailing[2]} ${trailing[1].trim()}`;

  /*
    "2-3 eggs" is somewhere between two and three, and the midpoint is the only
    answer that is not a decision about whether to flatter her.

    A hyphen only counts between two numbers at the very start. "7-up" and
    "chicken-and-rice" are not ranges.
  */
  s = s.replace(/^(\d+(?:\.\d+)?)\s*(?:-|–|—|\s+to\s+)\s*(\d+(?:\.\d+)?)(?=\s|$)/, (_, a, b) =>
    tidy((Number(a) + Number(b)) / 2));

  /*
    "half a pork chop", "a couple of eggs", "two chicken thighs", "a dozen eggs".

    Only at the very start. "chicken and a couple of eggs" is a meal with two
    components rather than a portion of one thing, and the estimator is what
    handles those — reading it as "2 chicken and eggs" would be worse than
    leaving it alone.
  */
  s = s.replace(
    /^(?:(half|quarter)\s+(?:a|an)\s+|(?:a|an)\s+(couple|few|several|dozen)\s+(?:of\s+)?|(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|half|quarter)\s+)/,
    (_, frac, group, word) => `${tidy(WORDS[frac ?? group ?? word])} `,
  );

  return s.replace(/\s+/g, " ").trim();
}
