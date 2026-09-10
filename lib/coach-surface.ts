/**
 * Which screen the coach is being asked about, from the path.
 *
 * The two coach buttons used to sit in each page's own header — seven copies
 * of the same pair, each with its own slot to keep tidy, and on Train it made
 * a whole strip of chrome above the session. They live in the companion's box
 * now, which is on every screen already, so this is the one place that says
 * what the coach is being asked about here.
 *
 * `page` is what `contextForPath()` on the server understands; `label` is the
 * word the sheet uses for what it is reading. A path with no entry gets no
 * buttons — tapping the figure still opens the coach, it just arrives without
 * an opinion to offer about a screen there is nothing to say about.
 */
export type CoachSurface = { page: "train" | "plan" | "progress"; label: string };

const SURFACES: [RegExp, CoachSurface][] = [
  [/^\/train/, { page: "train", label: "session" }],
  [/^\/plan/, { page: "plan", label: "plan" }],
  [/^\/progress/, { page: "progress", label: "progress" }],
  [/^\/eat/, { page: "plan", label: "food" }],
  [/^\/kitchen/, { page: "plan", label: "the kitchen" }],
  [/^\/learn/, { page: "train", label: "the library" }],
  [/^\/settings/, { page: "progress", label: "your setup" }],
];

export function coachSurfaceFor(path: string): CoachSurface | null {
  for (const [test, surface] of SURFACES) if (test.test(path)) return surface;
  return null;
}
