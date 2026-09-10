/**
 * Where the day stands against each target, as something a bar can draw.
 *
 * Pure, because every interesting case here is a judgement rather than a
 * pixel: what counts as "there", what counts as over, and — the one that
 * matters most — when the app is not entitled to say either because the day
 * holds an entry with no figures on it.
 *
 * The bands are deliberately generous. Nobody eats to the gram, and a card
 * that says "over" at 2010 of 2000 is a card that is wrong every day and
 * teaches her to ignore it.
 */
export type MacroState = "under" | "there" | "over" | "unknown";

/** Within this of the target counts as hitting it. */
export const ON_TARGET_BAND = 0.05;
/** Past this much over is worth colouring as over rather than as done. */
export const OVER_BAND = 0.1;

export type MacroRow = {
  key: "calories" | "protein" | "carbs" | "fat";
  label: string;
  /** Grams, or calories for the first one. */
  value: number;
  target: number | null;
  /** False when some entry carried no figure, so `value` is a floor. */
  complete: boolean;
  suffix: string;
};

export type MacroBar = MacroRow & {
  state: MacroState;
  /** 0–1 of the target, clamped for drawing. Null with no target. */
  fill: number | null;
  /** How far past the target, in the row's own unit. Zero unless over. */
  over: number;
};

export function macroBar(row: MacroRow): MacroBar {
  if (row.target === null || row.target <= 0) {
    return { ...row, state: "unknown", fill: null, over: 0 };
  }
  const ratio = row.value / row.target;
  const over = Math.max(0, row.value - row.target);
  /*
    A floor cannot be called over *or* under.

    "≥1150 of 2000" is not 850 short — it is at least 1150 and nobody knows
    the rest, and drawing that as a half-empty bar tells her to eat more on a
    day she may already be over. Only a total built entirely from entries that
    carried figures gets a verdict; the rest gets a bar and no colour.
  */
  if (!row.complete) {
    return { ...row, state: "unknown", fill: Math.min(1, ratio), over: 0 };
  }
  const state: MacroState =
    ratio > 1 + OVER_BAND ? "over"
      : ratio >= 1 - ON_TARGET_BAND ? "there"
        : "under";
  return { ...row, state, fill: Math.min(1, ratio), over: Math.round(over) };
}

/**
 * The one line to say after something is logged.
 *
 * Never a scold. Going over is information she can use for the next meal, not
 * a verdict on the day — and "you are over" said warmly at four in the
 * afternoon is the difference between logging dinner and not logging it,
 * which is the only thing that actually breaks a food diary.
 */
export function afterLogLine(bars: MacroBar[]): { text: string; tone: "good" | "warn" | "plain" } {
  const cals = bars.find((b) => b.key === "calories");
  const protein = bars.find((b) => b.key === "protein");

  if (cals?.state === "over") {
    return {
      text: `That puts you ${cals.over} over for the day. Worth knowing for tonight — one day does not decide anything.`,
      tone: "warn",
    };
  }
  if (protein?.state === "there" || protein?.state === "over") {
    return { text: "Protein target hit. That is the one that matters most.", tone: "good" };
  }
  if (cals?.state === "there") {
    return { text: "Right on your calories for the day.", tone: "good" };
  }
  if (cals?.fill !== null && cals?.fill !== undefined && cals.fill >= 0.5) {
    const left = Math.max(0, (cals.target ?? 0) - cals.value);
    return { text: `Logged. ${left} left today, and ${Math.max(0, (protein?.target ?? 0) - (protein?.value ?? 0))}g of protein to go.`, tone: "plain" };
  }
  return { text: "Logged. Good start on the day.", tone: "plain" };
}
