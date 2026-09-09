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

/**
 * Which slot the pointer is over when the rows are not in one column.
 *
 * On a wide screen the day is a grid, two or three cards abreast, and the
 * vertical rule above is meaningless there: half the cards share a `y`, so
 * dragging sideways moved nothing and dragging down jumped whole rows. That
 * is why reordering worked on a phone and did nothing on a desktop.
 *
 * Nearest centre, in both axes. It reduces to the same answer as `slotFor`
 * in a single column and is the only thing that means anything in a grid.
 */
export function slotForPoint(
  centres: { x: number; y: number }[], x: number, y: number,
): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < centres.length; i++) {
    const dx = centres[i].x - x;
    const dy = centres[i].y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Whether these rows are stacked in one column.
 *
 * Two cards that start at the same height are side by side, which is the
 * whole difference between the two rules above. Measured rather than assumed
 * from a breakpoint: the same list is a column on a phone, a grid on a
 * laptop, and a wider grid on a monitor.
 */
export function isSingleColumn(tops: number[]): boolean {
  for (let i = 1; i < tops.length; i++) if (Math.abs(tops[i] - tops[0]) < 4) return false;
  return true;
}
