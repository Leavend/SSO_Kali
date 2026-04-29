import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('auth shell layout CSS', () => {
  it('keeps the login shell viewport-locked without blank scroll bands', () => {
    const authCss = readFileSync(resolve(root, 'web/styles/auth.css'), 'utf8')
    const adminCss = readFileSync(resolve(root, 'web/styles/admin.css'), 'utf8')

    expect(authCss).toContain('min-height: 100dvh;')
    expect(authCss).toContain('height: 100dvh;')
    expect(authCss).toContain('overflow: clip;')
    expect(authCss).toContain('overscroll-behavior: none;')
    expect(adminCss).toContain('.app-shell--auth')
    expect(adminCss).toContain('min-height: 100dvh;')
    expect(adminCss).toContain('height: 100dvh;')
    expect(adminCss).toContain('overflow: clip;')
  })

  it('pins root surfaces to the app canvas to avoid white browser gutters', () => {
    const baseCss = readFileSync(resolve(root, 'web/styles/base.css'), 'utf8')

    expect(baseCss).toContain('html,')
    expect(baseCss).toContain('body,')
    expect(baseCss).toContain('#app {')
    expect(baseCss).toContain('html {')
    expect(baseCss).toContain('background: var(--canvas);')
  })
})
