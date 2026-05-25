import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('portal liquid-glass dark mode tokens', () => {
  const css = readFileSync(resolve(__dirname, '../main.css'), 'utf8')

  it('overrides glass surface and text tokens in dark mode', () => {
    const darkBlock = css.match(/\.dark \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(darkBlock).toContain('--text-primary: oklch(0.96 0.005 270);')
    expect(darkBlock).toContain('--text-secondary: oklch(0.78 0.012 270);')
    expect(darkBlock).toContain(
      '--glass-bg-primary: color-mix(in oklch, var(--color-neutral-900) 68%, transparent);',
    )
    expect(darkBlock).toContain('--glass-border-subtle: oklch(1 0 0 / 14%);')
  })

  it('provides portal canvas wash variants for light and dark themes', () => {
    expect(css).toContain('.portal-shell__wash')
    expect(css).toContain('.dark .portal-shell__wash')
  })

  it('defines semantic dark-mode tones used by portal risk surfaces', () => {
    const themeBlock = css.match(/@theme inline \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(themeBlock).toContain('--color-error-950:')
    expect(themeBlock).toContain('--color-error-400:')
    expect(themeBlock).toContain('--color-error-300:')
    expect(themeBlock).toContain('--color-warning-950:')
    expect(themeBlock).toContain('--color-warning-300:')
    expect(themeBlock).toContain('--color-success-950:')
    expect(themeBlock).toContain('--color-success-400:')
    expect(themeBlock).toContain('--color-success-300:')
    expect(themeBlock).toContain('--color-info-950:')
    expect(themeBlock).toContain('--color-info-200:')
  })

  it('renders standalone nav pills as transparent liquid-glass material', () => {
    const navBlock = css.match(/\.portal-nav-pill \{[\s\S]*?\n\}/)?.[0] ?? ''
    const ringBlock = css.match(/\.portal-nav-pill::before \{[\s\S]*?\n\}/)?.[0] ?? ''
    const activeBlock = css.match(/\.portal-nav-pill--active \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(navBlock).toContain('--portal-nav-pill-body-top: rgb(255 255 255 / 0.2);')
    expect(navBlock).toContain('radial-gradient(ellipse 82% 130% at 50% -42%')
    expect(navBlock).toContain('0 12px 24px -16px var(--portal-nav-pill-shadow)')
    expect(ringBlock).toContain('conic-gradient(')
    expect(ringBlock).toContain('animation-play-state: paused;')
    expect(activeBlock).toContain('var(--color-brand-400)')
  })
})
