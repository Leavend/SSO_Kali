/**
 * Regression: Aurora pill autofill text colour parity.
 *
 * Background:
 *   When Chrome / Brave fills a saved credential into the login pill,
 *   the WebKit autofill style was repainting `-webkit-text-fill-color`
 *   on hover/focus, flipping the saved text from white to dark on the
 *   matte pill. The CSS fix lives in `src/assets/styles/main.css` under
 *   the `.aurora-shell .sso-glass-pill input:-webkit-autofill*` rules
 *   and re-asserts the text fill across rest / hover / focus / active.
 *
 *   This test guards the rule against regression: if anyone deletes or
 *   weakens it, the pill text-on-photo contrast breaks silently in Brave
 *   and the bug returns. We assert by reading the CSS source (jsdom
 *   cannot resolve `:-webkit-autofill` selectors at runtime).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(here, '../main.css')

function loadAuthCss(): string {
  return readFileSync(cssPath, 'utf8')
}

describe('Aurora pill autofill — text colour parity', () => {
  const css = loadAuthCss()

  it('keeps the autofill text-fill override scoped to the auth shell', () => {
    expect(css).toContain('.aurora-shell .sso-glass-pill input:-webkit-autofill')
    expect(css).toContain('.aurora-shell .sso-glass-pill input:-webkit-autofill:hover')
    expect(css).toContain('.aurora-shell .sso-glass-pill input:-webkit-autofill:focus')
    expect(css).toContain('.aurora-shell .sso-glass-pill input:-webkit-autofill:active')
  })

  it('asserts -webkit-text-fill-color invariant against the pill text token', () => {
    const block =
      css.match(
        /\.aurora-shell \.sso-glass-pill input:-webkit-autofill[\s\S]*?\}/,
      )?.[0] ?? ''

    expect(block).toContain('-webkit-text-fill-color: var(--text-primary) !important')
    expect(block).toContain('caret-color: var(--text-primary) !important')
  })

  it('protects against the WebKit internal autofill repaint as well', () => {
    expect(css).toContain('.aurora-shell .sso-glass-pill input:-internal-autofill-selected')
  })
})
