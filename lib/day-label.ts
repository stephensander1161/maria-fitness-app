/**
 * The eyebrow beside a day's name — "Tuesday · Shoulders", "Today · Friday".
 *
 * A day nobody has renamed is titled after its own weekday, so the naive
 * version rendered "WEDNESDAY · Wednesday": the same word twice, and on a
 * phone the second copy is the one that truncates to "Wednesd…". Anything the
 * title already says is dropped from the eyebrow rather than repeated.
 */
export function dayEyebrow(prefix: string | undefined | null, title: string): string {
  const name = title.trim().toLowerCase();
  return (prefix ?? "")
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part && !opens(name, part.toLowerCase()))
    .join(" · ");
}

/**
 * Does the title already start with this word?
 *
 * The placeholder a day gets when something is added to an empty one is
 * "Wednesday session", so an exact match was not enough — "WEDNESDAY ·
 * Wednesday session" still said it twice. The boundary check is what keeps
 * "Mon" from swallowing the eyebrow on a day called "Monday sessions" only
 * when it genuinely is the same word: the next character has to be the end
 * of the title or something other than a letter or a digit.
 */
function opens(title: string, part: string): boolean {
  if (!title.startsWith(part)) return false;
  const after = title.charAt(part.length);
  return after === "" || !/[a-z0-9]/.test(after);
}
