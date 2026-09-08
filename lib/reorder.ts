/**
 * Moving one item of a list to another position.
 *
 * Pulled out of the drag handler because the arithmetic is where this kind of
 * thing goes wrong — an off-by-one that only shows up dragging downwards, and
 * only past the item you started on. Pure, so both directions are tested.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const target = Math.max(0, Math.min(items.length - 1, to));
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Which slot the pointer is over, given where each row currently sits.
 *
 * `mids` are the vertical midpoints of the rows in their current order. A row
 * takes the slot of the last midpoint the pointer has passed, which is what
 * makes the list settle *under* the finger rather than one row behind it.
 */
export function slotFor(mids: number[], y: number): number {
  let slot = 0;
  for (let i = 0; i < mids.length; i++) if (y > mids[i]) slot = i;
  return slot;
}
