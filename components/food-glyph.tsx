/**
 * A line glyph per food category.
 *
 * Not a photograph: 400 food photos would mean licensing, hosting and payload
 * for something she gains little from, since she typed the name and knows what
 * it is. What a picture is genuinely for here is making a row scannable, and a
 * category glyph does that at 20 bytes and in the app's own line-drawing style.
 */
const GLYPHS: Record<string, { path: string; label: string }> = {
  meat:      { label: "meat",      path: "M4 14c0-4 3-7 7-7 4 0 6 2 8 2s3-1 3-1v4c0 4-4 7-9 7s-9-1-9-5Z M8 12h.01" },
  fish:      { label: "fish",      path: "M3 12c3-4 7-6 11-6 3 0 5 2 7 6-2 4-4 6-7 6-4 0-8-2-11-6Z M16 11h.01 M3 12l-1-3 M3 12l-1 3" },
  dairy:     { label: "dairy",     path: "M8 3h8l-1 3v13a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6L8 3Z M9 10h6" },
  eggs:      { label: "eggs",      path: "M12 3c3 0 6 5 6 9a6 6 0 0 1-12 0c0-4 3-9 6-9Z" },
  grain:     { label: "grain",     path: "M12 21V8 M12 8c0-3 2-5 4-5 0 3-2 5-4 5Z M12 8c0-3-2-5-4-5 0 3 2 5 4 5Z M12 14c0-3 2-5 4-5 0 3-2 5-4 5Z M12 14c0-3-2-5-4-5 0 3 2 5 4 5Z" },
  legume:    { label: "legume",    path: "M5 15a5 5 0 0 1 5-5h9a5 5 0 0 1 0 10h-9a5 5 0 0 1-5-5Z M9 15h.01 M14 15h.01" },
  vegetable: { label: "vegetable", path: "M12 21c-4 0-7-3-7-7 0-3 2-5 5-5 1 0 2 .4 2 1 0-4 2-6 5-7-1 3 0 5 1 6 2 1 3 3 3 5 0 4-3 7-9 7Z" },
  fruit:     { label: "fruit",     path: "M12 8c-4-3-9 0-9 5 0 4 3 8 6 8 1 0 2-.5 3-.5s2 .5 3 .5c3 0 6-4 6-8 0-5-5-8-9-5Z M12 8V4 M12 4c2 0 3-1 3-2" },
  nut:       { label: "nut",       path: "M12 3l8 5v8l-8 5-8-5V8l8-5Z M12 9v6" },
  fat:       { label: "fat",       path: "M12 3c3 5 6 7 6 11a6 6 0 0 1-12 0c0-4 3-6 6-11Z" },
  sauce:     { label: "sauce",     path: "M9 3h6v3l2 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-3V3Z M7 13h10" },
  drink:     { label: "drink",     path: "M6 4h12l-2 16H8L6 4Z M7 10h10" },
  snack:     { label: "snack",     path: "M4 8h16l-1.5 12h-13L4 8Z M8 8V5a4 4 0 0 1 8 0v3" },
  prepared:  { label: "prepared",  path: "M3 12h18 M4 12a8 8 0 0 1 16 0 M3 16h18" },
};

const FALLBACK = { label: "food", path: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z M9 12h6" };

export function FoodGlyph({
  category,
  className = "",
}: {
  category: string | null | undefined;
  className?: string;
}) {
  const glyph = GLYPHS[category ?? ""] ?? FALLBACK;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={glyph.label}
    >
      <path d={glyph.path} />
    </svg>
  );
}
