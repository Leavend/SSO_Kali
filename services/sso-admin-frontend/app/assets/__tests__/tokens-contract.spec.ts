import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const tokens = (): string => readFileSync(path.resolve(__dirname, '../tokens.css'), 'utf8')

describe('Swiss tokens.css contract', () => {
  it('anchors the single Swiss palette', () => {
    const css = tokens()
    expect(css).toMatch(/--accent:\s*#002FA7/i)
    expect(css).toMatch(/--danger:\s*#E4002B/i)
    expect(css).toMatch(/--bg:\s*#FFFFFF/i)
    expect(css).toMatch(/--bg-2:\s*#F7F7F8/i)
    expect(css).toMatch(/--card:\s*#FFFFFF/i)
    expect(css).toMatch(/--fg:\s*#0A0A0A/i)
    expect(css).toMatch(/--border:\s*#E5E5E7/i)
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
      '--font-mono',
    ]
    for (const token of required) {
      // Assertion value contains the token name so failures are self-describing
      expect(css).toContain(`${token}:`)
    }
  })

  it('uses one type family (Söhne/Helvetica Neue), no serif display', () => {
    const css = tokens()
    expect(css).toMatch(/--font-sans:[^;]*Söhne/)
    expect(css).toMatch(/--font-sans:[^;]*Helvetica Neue/)
    expect(css).not.toMatch(/Plus Jakarta/i)
    expect(css).not.toMatch(/Instrument Serif/i)
    expect(css).not.toMatch(/--font-serif/)
    // Ban generic `serif` keyword; sans-serif is allowed (the `-` is in [a-z-])
    expect(css).not.toMatch(/(?<![a-z-])serif/)
    expect(css).not.toMatch(/fonts\.googleapis\.com/)
  })

  it('bans soft-shadow, glass, glow and gradient brand tokens', () => {
    const css = tokens()
    const forbidden = [
      '--shadow-lg',
      '--shadow-glass',
      '--shadow-glow',
      '--brand-grad',
      '--glass-bg',
      'glow',
    ]
    for (const banned of forbidden) {
      // Assertion value contains the banned term so failures are self-describing
      expect(css).not.toContain(banned)
    }
  })

  it('keeps a single accent (no second brand colour token)', () => {
    const css = tokens()
    expect(css).not.toMatch(/--primary:/)
    expect(css).not.toMatch(/data-accent=/)
    expect(css).not.toMatch(/--avatar-/)
  })
})
