import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const tokens = (): string => readFileSync(path.resolve(__dirname, '../tokens.css'), 'utf8')

describe('Modern Premium tokens.css contract', () => {
  it('anchors the single premium palette', () => {
    const css = tokens()
    expect(css).toMatch(/--accent:\s*#4f46e5/i)
    expect(css).toMatch(/--danger:\s*#ef4444/i)
    expect(css).toMatch(/--bg:\s*#f8fafc/i)
    expect(css).toMatch(/--bg-2:\s*#f1f5f9/i)
    expect(css).toMatch(/--card:\s*#ffffff/i)
    expect(css).toMatch(/--fg:\s*#0f172a/i)
    expect(css).toMatch(/--border:\s*#e2e8f0/i)
  })

  it('defines every neutral/accent-tint token components reference', () => {
    const css = tokens()
    const required = [
      '--fg-2',
      '--fg-3',
      '--border-strong',
      '--muted',
      '--muted-2',
      '--accent-fg',
      '--accent-600',
      '--accent-soft',
      '--accent-soft-fg',
      '--accent-ring',
      '--danger-600',
      '--danger-fg',
      '--danger-soft',
      '--danger-soft-fg',
      '--success',
      '--success-soft',
      '--success-soft-fg',
      '--warning',
      '--warning-soft',
      '--warning-soft-fg',
      '--info',
      '--info-soft',
      '--info-soft-fg',
      '--r-sm',
      '--r-md',
      '--r-full',
      '--ctl-h',
      '--font-sans',
      '--font-condensed',
      '--font-mono',
    ]
    for (const token of required) {
      // Assertion value contains the token name so failures are self-describing
      expect(css).toContain(`${token}:`)
    }
  })

  it('uses one type family (Plus Jakarta Sans), no serif display', () => {
    const css = tokens()
    expect(css).toMatch(/--font-sans:[^;]*Plus Jakarta Sans/)
    expect(css).not.toMatch(/Instrument Serif/i)
    expect(css).not.toMatch(/--font-serif/)
    // Ban generic `serif` keyword; sans-serif is allowed (the `-` is in [a-z-])
    expect(css).not.toMatch(/(?<![a-z-])serif/)
  })

  it('defines shadows and support tokens', () => {
    const css = tokens()
    const shadows = [
      '--shadow-sm',
      '--shadow-md',
      '--shadow-lg',
      '--shadow-glow',
    ]
    for (const shadow of shadows) {
      expect(css).toContain(shadow)
    }
  })

  it('keeps a single accent (no second brand colour token)', () => {
    const css = tokens()
    expect(css).not.toMatch(/--primary:/)
    expect(css).not.toMatch(/data-accent=/)
    expect(css).not.toMatch(/--avatar-/)
  })
})
