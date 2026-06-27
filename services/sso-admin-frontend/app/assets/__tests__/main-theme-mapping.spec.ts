import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const main = (): string => readFileSync(path.resolve(__dirname, '../main.css'), 'utf8')

describe('Swiss main.css Tailwind mapping', () => {
  it('imports Tailwind v4 and the Swiss tokens', () => {
    const css = main()
    expect(css).toMatch(/@import\s+['"]tailwindcss['"]/)
    expect(css).toMatch(/@import\s+['"]\.\/tokens\.css['"]/)
    expect(css).toMatch(/@theme inline\s*\{/)
  })

  it('maps the single accent onto both primary and accent utility anchors', () => {
    const css = main()
    expect(css).toMatch(/--color-primary:\s*var\(--accent\)/)
    expect(css).toMatch(/--color-accent:\s*var\(--accent\)/)
    expect(css).toMatch(/--color-destructive:\s*var\(--danger\)/)
    expect(css).toMatch(/--color-border:\s*var\(--border\)/)
    expect(css).toMatch(/--color-ring:\s*var\(--accent-ring\)/)
    expect(css).toMatch(/--font-sans:\s*var\(--font-sans\)/)
  })

  it('declares no shadow utility anchors and no second accent', () => {
    const css = main()
    expect(css).not.toMatch(/--shadow-/)
    expect(css).not.toMatch(/--color-brand-/)
    expect(css).not.toMatch(/backdrop-filter/)
  })

  it('defines the dark custom-variant using the .dark class', () => {
    const css = main()
    expect(css).toMatch(/@custom-variant dark\s*\(&:is\(\.dark \*\)\)/)
  })
})
