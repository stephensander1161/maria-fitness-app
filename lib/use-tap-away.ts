"use client";

import { useEffect, useRef } from "react";

/**
 * Dismiss a corner note by tapping anywhere else.
 *
 * "Got it" being the only way out means a notification is something she has to
 * *deal with*, and on a phone the button sits low over the page she is trying
 * to read. Tapping away is what everybody already tries first.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not swallow the tap.** No backdrop, no preventDefault: this
 *   listens in the capture phase and never stops the event, so the tap that
 *   dismisses the note also presses whatever was under her thumb. A
 *   transparent backdrop would make the first tap on the page do nothing,
 *   which is a worse trade than the button was.
 * - **It does not arm immediately.** The note rises over 320ms, and iOS can
 *   deliver a stray tap from the navigation that brought her here. Dismissing
 *   before she has seen it is the one failure that makes the feature pointless
 *   — the note is marked read on the account and never comes back.
 *
 * Only for a note that is telling her something. Anything that asks a question
 * keeps its buttons: dismissing "did that fix it?" by brushing the screen
 * throws away the answer, which is the whole point of asking.
 */
/**
 * Whether one tap should put the note away. Pulled out of the listener so the
 * two ways it goes wrong can be tested without a DOM: firing before she has
 * read it, and firing on a tap that was *on* it.
 */
export function tapDismisses(
  { armed, inside }: { armed: boolean; inside: boolean },
): boolean {
  return armed && !inside;
}

/** Long enough for the 320ms rise, and for a ghost tap from the navigation
 *  that brought her here. */
export const TAP_AWAY_ARM_MS = 400;

export function useTapAway<T extends HTMLElement>(
  onAway: () => void,
  { armAfterMs = TAP_AWAY_ARM_MS }: { armAfterMs?: number } = {},
) {
  const box = useRef<T>(null);
  // Held in a ref so a caller can pass an inline arrow without re-binding the
  // listeners — and re-binding would restart the arming delay every render.
  const away = useRef(onAway);
  useEffect(() => { away.current = onAway; });

  useEffect(() => {
    let armed = false;
    const arm = setTimeout(() => { armed = true; }, armAfterMs);

    const onDown = (e: PointerEvent) => {
      const el = box.current;
      const inside = !!el && e.target instanceof Node && el.contains(e.target);
      if (tapDismisses({ armed, inside })) away.current();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") away.current(); };

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(arm);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [armAfterMs]);

  return box;
}
