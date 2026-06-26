import { describe, expect, it } from 'vitest'
import { pillStepSequence } from '../admin-nav-pill'

describe('pillStepSequence', () => {
  // `order` is the rendered (grouped) order expressed as visibleMenus indices.
  // e.g. backend [dashboard(0,Utama), roles(1,Keamanan), clients(2,Utama)] renders
  // grouped as Utama[0,2] then Keamanan[1] → order = [0, 2, 1].

  it('steps through visually adjacent links (render order), not raw index order', () => {
    // dashboard(0) → roles(1): glide down the rendered column 0 → 2 → 1,
    // NOT the raw-index jump 0 → 1 (which would teleport across sections).
    expect(pillStepSequence([0, 2, 1], 0, 1)).toEqual([2, 1])
  })

  it('walks upward symmetrically', () => {
    expect(pillStepSequence([0, 2, 1], 1, 0)).toEqual([2, 0])
  })

  it('settles directly (no steps) on the first selection where current index is -1', () => {
    expect(pillStepSequence([0, 2, 1], -1, 2)).toEqual([])
  })

  it('settles directly (no steps) when the target is not in the rendered order', () => {
    expect(pillStepSequence([0, 2, 1], 0, 9)).toEqual([])
  })

  it('returns no steps when already resting on the target', () => {
    expect(pillStepSequence([0, 2, 1], 2, 2)).toEqual([])
  })

  it('degrades to plain adjacent stepping when the order is contiguous (no regroup)', () => {
    expect(pillStepSequence([0, 1, 2, 3], 0, 3)).toEqual([1, 2, 3])
  })

  it('always ends on the target and never repeats the starting index', () => {
    const order = [0, 3, 1, 2]
    const seq = pillStepSequence(order, 0, 2)
    expect(seq[seq.length - 1]).toBe(2)
    expect(seq).not.toContain(0)
  })
})
