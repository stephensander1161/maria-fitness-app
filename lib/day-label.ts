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
    .filter((part) => part && part.toLowerCase() !== name)
    .join(" · ");
}
