/**
 * Pure stepping order for the admin sidebar active-pill animation.
 *
 * The sidebar renders menu links GROUPED into sections (Utama → Keamanan →
 * Observabilitas → Lainnya), but each link keeps its original `visibleMenus`
 * index. `order` is that rendered order expressed as `visibleMenus` indices
 * (render position → index) — a permutation of the visible indices.
 *
 * To animate the pill from `from` to `to` so it glides through VISUALLY adjacent
 * links, we must walk render POSITIONS, not raw `visibleMenus` indices (walking
 * raw indices teleports the pill across sections, since index order and render
 * order disagree once grouping reshuffles the links).
 *
 * Returns the `visibleMenus` indices to assign in sequence — excluding `from`,
 * ending at `to`. Returns `[]` when either endpoint is absent from `order`
 * (first selection with `from === -1`, or an unrendered target); the caller
 * settles directly to `to`, so there is never an infinite loop.
 */
export function pillStepSequence(order: readonly number[], from: number, to: number): number[] {
  const fromPos = order.indexOf(from)
  const toPos = order.indexOf(to)
  if (fromPos === -1 || toPos === -1) return []

  const sequence: number[] = []
  let pos = fromPos
  while (pos !== toPos) {
    pos += pos < toPos ? 1 : -1
    const stepIndex = order[pos]
    if (stepIndex !== undefined) sequence.push(stepIndex)
  }
  return sequence
}
